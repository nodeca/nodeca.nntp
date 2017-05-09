// NNTP article
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let Article = new Schema({
    source:  Schema.ObjectId,
    parent:  Schema.ObjectId,
    group:   Schema.ObjectId,
    index:   Number
  }, {
    versionKey: false
  });


  // Indexes
  //////////////////////////////////////////////////////////////////////////////

  // find an article by message_id (ARTICLE command)
  Article.index({ source: 1 });

  // mass-removal of messages
  Article.index({ parent: 1 });

  // get range of articles inside a group
  Article.index({ group: 1, index: 1 });


  N.wire.on('init:models', function emit_init_Article() {
    return N.wire.emit('init:models.' + collectionName, Article);
  });


  N.wire.on('init:models.' + collectionName, function init_model_Article(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
