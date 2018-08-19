var sinon = require('sinon');
var chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

global.expect = chai.expect;
global.sinon = sinon;
global.ShutdownHook = require('../');