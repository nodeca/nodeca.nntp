// Start NNTP group rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    group_id: { format: 'mongo', required: true }
  });

  N.wire.on(apiPath, async function nntp_group_rebuild_start(env) {
    let group = await N.models.nntp.Group.findById(env.params.group_id).lean(true);

    return N.queue['nntp_group_rebuild_' + group.type](env.params.group_id).run();
  });
};
