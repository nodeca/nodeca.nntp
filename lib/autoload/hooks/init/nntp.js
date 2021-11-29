// Fill out generic/dispatch methods for NNTP server
//

'use strict';


const _         = require('lodash');
const mongoose  = require('mongoose');
const url       = require('url');
const render    = require('nodeca.core/lib/system/render/common');
const userInfo  = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  let hostname = url.parse(N.config.bind?.default?.mount ?? 'http://localhost/').hostname;

  N.wire.before('init:server.nntp', function init_nntp_methods(nntp) {

    nntp._selectGroup = async function (session, name) {
      let group = await N.models.nntp.Group.findOne()
                            .where('name').equals(name)
                            .lean(true);

      if (await this._checkAccess(session, group)) {
        session.group = {
          _id:             group._id,  // internal, not used by nntp-server
          type:            group.type, // internal, not used by nntp-server
          min_index:       group.min_index,
          max_index:       group.max_index,
          total:           group.max_index - group.min_index + 1,
          name:            group.name,
          description:     '',
          current_article: group.min_index
        };

        return true;
      }

      return false;
    };


    nntp._getGroups = async function (session, time, wildmat) {
      let query = N.models.nntp.Group.find().sort('name');

      if (time) {
        let threshold = new mongoose.Types.ObjectId(Math.max(time.valueOf() / 1000, 0));

        query = query.where('_id').gte(threshold);
      }

      let groups = await query.lean(true);

      groups = groups.filter(group => (wildmat ? wildmat.test(group.name) : true));

      let have_access = await this._checkAccess(session, groups);

      groups = groups.filter((__, idx) => have_access[idx]);

      return groups;
    };


    nntp._getArticle = async function (session, id) {
      let m, article, group;

      if ((m = id.match(/^<([0-9a-f]{24})@.*>$/))) {
        article = await N.models.nntp.Article.findOne()
                           .where('source').equals(m[1])
                           .lean(true);

        group = await N.models.nntp.Group.findById(article.group)
                          .lean(true);

      } else if ((m = id.match(/^(\d+)$/))) {
        group = session.group;

        article = await N.models.nntp.Article.findOne()
                            .where('group').equals(group._id)
                            .where('index').equals(Number(m[1]))
                            .lean(true);
      }

      if (!article) return null;

      return typeof this['_fetchArticleData_' + group.type] === 'function' ?
             this['_fetchArticleData_' + group.type](group, article) :
             null;
    };


    nntp._getRange = async function (session, from, to) {
      let group = session.group;

      let articles = await N.models.nntp.Article.find()
                               .where('group').equals(group._id)
                               .where('index').gte(from)
                               .where('index').lte(to)
                               .lean(true);

      return typeof this['_fetchArticleData_' + group.type] === 'function' ?
             this['_fetchArticleData_' + group.type](group, articles) :
             [];
    };


    nntp._getNewNews = async function (session, time, wildmat) {
      let groups = await N.models.nntp.Group.find().lean(true);

      groups = groups.filter(group => (wildmat ? wildmat.test(group.name) : true));

      if (!groups.length) return [];

      let have_access = await this._checkAccess(session, groups);

      groups = groups.filter((__, idx) => have_access[idx]);

      if (!groups.length) return [];

      let query = N.models.nntp.Article.find()
                      .where('group').in(groups.map(g => g._id))
                      .sort('_id');

      if (time) {
        let threshold = new mongoose.Types.ObjectId(Math.max(time.valueOf() / 1000, 0));

        query = query.where('_id').gte(threshold);
      }

      let articles = await query.lean(true);

      return articles;
    };


    nntp._buildHeaderField = function (session, article, field) {
      switch (field) {
        case 'from':         return article.from;
        case 'newsgroups':   return article.group.name;
        case 'subject':      return article.subject;
        case 'date':         return article.date.toUTCString();
        case 'message-id':   return `<${article.source}@${hostname}>`;
        case 'references':   return article.reply_to ? (`<${article.reply_to}@${hostname}>`) : null;
        case 'content-type': return 'text/html; charset=utf8';
        case 'xref':         return `${hostname} ${article.group.name}:${article.index}`;
        case 'content-transfer-encoding': return 'base64';
        default:                  return null;
      }
    };


    nntp._buildHead = function (session, article) {
      let fields = [
        'From', 'Newsgroups', 'Subject', 'Date', 'Message-ID', 'References',
        'Content-Type', 'Content-Transfer-Encoding', 'Xref'
      ];

      let result = [];

      for (let field of fields) {
        let content = nntp._buildHeaderField(session, article, field.toLowerCase());

        if (content === null || typeof content === 'undefined') continue;

        result.push(field + ': ' + content);
      }

      return result;
    };


    nntp._buildBody = function (session, article) {
      let locale = session.user_info?.locale ?? N.config.locales[0];
      let helpers = {};

      helpers.t          = (phrase, params) => N.i18n.t(locale, phrase, params);
      helpers.t.exists   = phrase => N.i18n.hasPhrase(locale, phrase);
      helpers.link_to    = (name, params) => N.router.linkTo(name, params) || '#';
      helpers.asset_url  = path => N.assets.asset_url(path);
      helpers.asset_body = path => N.assets.asset_body(path);

      let html = render(N, 'nntp.templates.' + article.type, article, helpers);

      return Buffer.from(html).toString('base64').match(/.{1,76}/g);
    };


    nntp._authenticate = async function (session) {
      let authinfo_user = session.authinfo_user;
      let authinfo_pass = session.authinfo_pass;

      session.authinfo_user = null;
      session.authinfo_pass = null;

      let user = await N.models.users.User.findOne()
                           .where('nick').equals(authinfo_user)
                           .lean(true);

      if (!user) return false;

      let authProvider = await N.models.users.AuthProvider.findOne()
                                   .where('user').equals(user._id)
                                   .where('type').equals('plain')
                                   .where('exists').equals(true)
                                   .lean(false);

      if (!authProvider) return false;

      if (!await authProvider.checkPass(authinfo_pass)) return false;

      // TODO: log this login attempt somehow?
      //
      //await N.models.users.AuthProvider.updateOne(
      //  { _id: authProvider._id },
      //  { $set: { last_ts: Date.now(), last_ip: ??? } }
      //);

      session.user_info = await userInfo(N, user._id);

      return true;
    };


    nntp._onError = function (err) {
      N.logger.error('NNTP error (%s): %s', err.nntp_command, err.stack || err);
    };


    // Custom method used to retrieve user_info object for the current user
    //
    nntp._getUserInfo = async function (session) {
      // lazy loading for guest sessions
      session.user_info = session.user_info || await userInfo(N, null);

      return session.user_info;
    };


    // Custom method used to check permissions for NNTP groups,
    // returns a subset of the groups that allow access.
    //
    // Requires nntp._filterAccess_X methods to be present,
    // where X is a group type (e.g. nntp._filterAccess_forum).
    //
    nntp._checkAccess = async function (session, groups) {
      let single_group_call = false;

      if (!Array.isArray(groups)) {
        groups = [ groups ];
        single_group_call = true;
      }

      let types = _.uniq(groups.map(g => g.type)).filter(type => typeof this['_filterAccess_' + type] === 'function');

      let result = new Array(groups.length).fill(null);

      await Promise.all(types.map(type =>
        this['_filterAccess_' + type](session, groups)
          .then(access_entries => access_entries.forEach((res, idx) => {
            if (result[idx] === null || Boolean(result[idx]) === true) result[idx] = result[idx] || res;
          }))
      ));

      return single_group_call ? result[0] : result;
    };
  });
};
