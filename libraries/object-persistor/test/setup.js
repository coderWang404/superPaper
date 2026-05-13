const SandboxedModule = require('sandboxed-module')
const chai = require('chai')
const sinon = require('sinon')

chai.use(require('sinon-chai'))
chai.use(require('chai-as-promised'))

SandboxedModule.configure({
  requires: {
    '@superpaper/logger': {
      debug() {},
      log() {},
      info() {},
      warn() {},
      error() {},
      err() {},
    },
    '@superpaper/metrics': {
      inc: sinon.stub(),
      count: sinon.stub(),
      histogram: sinon.stub(),
      Timer: class Timer {
        done() {}
      },
    },
  },
  globals: { Buffer, Math, console, process, URL },
  sourceTransformers: {
    removeNodePrefix: function (source) {
      return source.replace(/require\((['"])node:/g, 'require($1')
    },
  },
})
