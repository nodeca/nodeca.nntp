// NNTP group
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let Group = new Schema({
    name:      String,
    source:    Schema.ObjectId,

    // content type (usually, 'forum')
    type:      String,

    // low water mark (index of the first available article)
    min_index: { type: Number, 'default': 0 },

    // high water mark (index of the last article which may or may not be deleted)
    max_index: { type: Number, 'default': 0 }
  }, {
    versionKey: false
  });


  // Indexes
  //////////////////////////////////////////////////////////////////////////////

  // find a group by name (GROUP command)
  Group.index({ name: 1 });

  // find a group for a forum section
  Group.index({ source: 1 });


  N.wire.on('init:models', function emit_init_Group() {
    return N.wire.emit('init:models.' + collectionName, Group);
  });


  N.wire.on('init:models.' + collectionName, function init_model_Group(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
