// Fill out generic/dispatch methods for NNTP server
//

'use strict';


const _         = require('lodash');
const mongoose  = require('mongoose');
const userInfo  = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  N.wire.before('init:server.nntp', function init_nntp_methods(nntp) {

    nntp._selectGroup = async function (session, name) {
      let group = await N.models.nntp.Group.findOne()
                            .where('name').equals(name)
                            .lean(true);

      group = (await this._filterAccess(session, [ group ]))[0];

      if (group) {
        session.group       = group;
        session.group.total = group.max_index - group.min_index + 1;
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

      groups = await this._filterAccess(session, groups);

      return groups;
    };

    // Custom method used to retrieve user_info object for the current user
    //
    nntp._getUserInfo = async function (/*session*/) {
      // TODO
      return await userInfo(N, null);
    };

    // Custom method used to check permissions for NNTP groups,
    // returns a subset of the groups that allow access.
    //
    // Requires nntp._filterAccess_X methods to be present,
    // where X is a group type (e.g. nntp._filterAccess_forum).
    //
    nntp._filterAccess = async function (session, groups) {
      let types = _.uniq(_.map(groups, 'type')).filter(type => typeof this['_filterAccess_' + type] === 'function');

      await Promise.all(types.map(type => this['_filterAccess_' + type](session, groups)));

      return groups.filter(group => !!group._allow_access);
    };
  });
};
