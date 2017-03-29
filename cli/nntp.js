// Start NNTP worker
//

'use strict';


////////////////////////////////////////////////////////////////////////////////


module.exports.commandLineArguments = [];


////////////////////////////////////////////////////////////////////////////////

module.exports.run = function (N/*, args*/) {
  return Promise.resolve()
    .then(() => N.wire.emit('init:models', N))
    .then(() => N.wire.emit('init:bundle', N))
    .then(() => N.wire.emit('init:services.nntp', N));
};
