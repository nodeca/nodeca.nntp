// Remove old messages from NNTP index, and limit total amount of messages
// in one NNTP group.
//

'use strict';

const ObjectId = require('mongoose').Types.ObjectId;


// limit amount of posts in index
const INDEX_MAX_POSTS = 2000;

// only keep messages for the last X days in index
const INDEX_MAX_DAYS  = 60;


module.exports = function (N) {
  N.wire.on('init:jobs', function register_nntp_group_cleanup() {
    const task_name = 'nntp_group_cleanup';

    if (!N.config.cron || !N.config.cron[task_name]) {
      return new Error(`No config defined for cron task "${task_name}"`);
    }

    N.queue.registerTask({
      name: task_name,
      pool: 'hard',
      cron: N.config.cron[task_name],
      async process() {
        try {
          let groups = await N.models.nntp.Group.find()
                                 .sort('name')
                                 .lean(true);

          for (let group of groups) {
            let start_post = await N.models.nntp.Article.findOne()
                                       .where('group').equals(group._id)
                                       .sort('-_id')
                                       .skip(INDEX_MAX_POSTS - 1)
                                       .limit(1);

            let min_id_by_count = start_post ? start_post._id : new ObjectId('000000000000000000000000');

            let min_id_by_date = new ObjectId(Date.now() / 1000 - INDEX_MAX_DAYS * 24 * 60 * 60);

            let min_id = String(min_id_by_count) > String(min_id_by_date) ?
                         min_id_by_count :
                         min_id_by_date;

            if (String(min_id) !== '000000000000000000000000') {
              await N.models.nntp.Article.remove()
                        .where('_id').lt(min_id)
                        .where('group').equals(group._id);

              let first_article = await N.models.nntp.Article.findOne()
                                            .where('group').equals(group._id)
                                            .sort('index')
                                            .lean(true);

              await N.models.nntp.Group.update(
                { _id: group._id },
                { $set: {
                  min_index: first_article ? first_article.index : group.last_index + 1
                } }
              );
            }
          }

        } catch (err) {
          // don't propagate errors because we don't need automatic reloading
          N.logger.error('"%s" job error: %s', task_name, err.message || err);
        }
      }
    });
  });
};
