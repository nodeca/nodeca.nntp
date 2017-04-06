// Show a list of all existing NNTP groups
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, async function nntp_groups_list(env) {
    env.res.head.title = env.t('title');

    env.res.groups = await N.models.nntp.Group.find()
                               .select('_id name')
                               .sort('name')
                               .lean(true);

    env.res.rebuilds_running = [];
  });
};
