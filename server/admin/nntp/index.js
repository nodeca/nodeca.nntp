// Show a list of all existing NNTP groups
//

'use strict';

const _  = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});


  N.wire.on(apiPath, async function nntp_groups_list(env) {
    env.res.head.title = env.t('title');

    let groups = await N.models.nntp.Group.find()
                           .sort('name')
                           .lean(true);

    let rebuild_in_progress = {};

    await Promise.all(groups.map(group => {
      let task_id = `nntp_group_rebuild_${group.type}:${group._id}`;

      return N.queue.getTask(task_id).then(task => {
        if (task && task.state !== 'finished') {
          rebuild_in_progress[group._id] = true;
        }
      });
    }));

    env.res.groups = groups;
    env.res.rebuild_in_progress = rebuild_in_progress;
    env.res.menu = _.get(N.config, 'menus.admin.nntp', {});
  });
};
