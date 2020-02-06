// NNTP group
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let Group = new Schema({
    name:       String,
    source:     Schema.ObjectId,

    // content type (usually, 'forum')
    type:       String,

    // min visible post index (default max_index+1 means that group is empty)
    min_index:  { type: Number, default: 1 },

    // max visible post index
    max_index:  { type: Number, default: 0 },

    // Message counter. We can't use min/max directly,
    // because last message can be deleted.
    last_index: { type: Number, default: 0 }
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
