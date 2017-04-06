
'use strict';

N.wire.once('navigate.done:' + module.apiPath, function init_handlers() {

  N.wire.on(module.apiPath + ':rebuild_group', function rebuild_click(data) {
    let group_id = data.$this.data('group-id');

    return N.io.rpc('admin.nntp.index.rebuild_group', { group_id });
  });
});
