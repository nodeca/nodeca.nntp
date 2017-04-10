// Start rebuild for all NNTP groups
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, async function nntp_group_rebuild_all_start() {
    let groups = await N.models.nntp.Group.find().sort('name').lean(true);

    await N.queue.chain(groups.map(group =>
      N.queue['nntp_group_rebuild_' + group.type](group._id)
    )).run();
  });
};
