'use strict';

exports.root = __dirname;
exports.name = 'nodeca.nntp';
exports.init = function (N) { require('./lib/autoload.js')(N); };
