// Remove a group
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    group_id: { format: 'mongo', required: true }
  });

  N.wire.on(apiPath, async function group_remove(env) {
    let group = await N.models.nntp.Group.findById(env.params.group_id);

    if (!group) throw N.io.NOT_FOUND;

    await group.remove();
    await N.models.nntp.Article.deleteMany({ group: env.params.group_id });
  });
};
