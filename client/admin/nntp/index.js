
'use strict';

N.wire.once('navigate.done:' + module.apiPath, function init_handlers() {

  // Rebuild all NNTP groups
  //
  N.wire.before(module.apiPath + ':rebuild_all', function rebuild_all_confirm() {
    return N.wire.emit('admin.core.blocks.confirm', t('rebuild_all_confirm'));
  });

  N.wire.on(module.apiPath + ':rebuild_all', function rebuild_all_exec() {
    return N.io.rpc('admin.nntp.rebuild_all')
               .then(() => N.wire.emit('navigate.reload'));
  });


  // Rebuild a single NNTP group
  //
  N.wire.before(module.apiPath + ':rebuild_group', function rebuild_confirm() {
    return N.wire.emit('admin.core.blocks.confirm', t('rebuild_group_confirm'));
  });

  N.wire.on(module.apiPath + ':rebuild_group', function rebuild_exec(data) {
    let group_id = data.$this.data('group-id');

    return N.io.rpc('admin.nntp.rebuild_group', { group_id })
               .then(() => N.wire.emit('navigate.reload'));
  });
});
