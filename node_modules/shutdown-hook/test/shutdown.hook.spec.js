var Promise = require('bluebird');

describe('Shutdown hook', function() {

  var hook = null;

  describe('#add', function() {

    beforeEach(function() {
      hook = new ShutdownHook();
    })

    it('should throw an error if #add was called without a function', function() {
      try {
        hook.add("test", {});
      } catch(e) { return;}

      throw new Error('Expected shutdown hook to throw an error')
    })

    it('should accept just function with no name', function() {
      hook.add(function() {})
      expect(hook.shutdownFunctions[0]).to.have.property('name', 'anonymous#1')
    })
  })

  describe('#shutdown', function() {

    var exitSpy;

    beforeEach(function() {
      hook = new ShutdownHook();
      exitSpy = sinon.spy();
      hook.exit = exitSpy;
    })

    function slowFn(timeout) {
      return function() {
        return new Promise(function(resolve, reject) {
          setTimeout(function() {
            resolve()
          }, timeout || 200)
        })
      }
    }

    describe('when order was not specified', function() {

      it('should call shutdown functions in the order they were added', function() {
        var first = sinon.spy(slowFn());
        var second = sinon.spy();
        hook.add(first);
        hook.add(second);
        return hook.shutdown().then(function() {
          expect(first).to.be.calledBefore(second);
        });
      })
    })

    describe('when order was specified', function() {

      it('should call shutdown functions sorted by their order', function() {
        var first = sinon.spy(slowFn());
        var second = sinon.spy();
        hook.add(second, {order: 10});
        hook.add(first, {order: 1});
        return hook.shutdown().then(function() {
          expect(first).to.be.calledBefore(second);
        });
      })

      it('should support explicit and implicit ordering', function() {
        var first = sinon.spy(slowFn());
        var second = sinon.spy();
        hook.add(second);
        hook.add(first, {order: -1});
        return hook.shutdown().then(function() {
          expect(first).to.be.calledBefore(second);
        });
      })

      it('should support names and order', function() {
        var first = sinon.spy(slowFn());
        var second = sinon.spy();
        hook.add(second, {order: 2, name: "second"});
        hook.add(first, {order: 1, name: "first"});
        return hook.shutdown().then(function() {
          expect(first).to.be.calledBefore(second);
        });
      })
    })

    it('should exit with exit code 1 in case the shutdown operation exceeds the provided timeout', function() {
      var exitSpy = sinon.spy();
      var timeout = 200;
      hook = new ShutdownHook({timeout: timeout});
      hook.exit = exitSpy;

      hook.add(slowFn(timeout + 100));
      return hook.shutdown().then(function() {
        expect(exitSpy).to.be.calledWithExactly(1);
      });
    })

    it('should exit with exit code 1 in case one of the shutdown functions throws an error', function() {
      hook.add(function() { throw new Error('')});
      return hook.shutdown().then(function() {
        expect(exitSpy).to.be.calledWithExactly(1);
      });
    })

    it('should exit with exit code 1 in case one of the shutdown functions returns a rejected promise', function() {
      hook.add(function() { return Promise.reject(new Error('')) });
      return hook.shutdown().then(function() {
        expect(exitSpy).to.be.calledWithExactly(1);
      });
    })

    it('should exit with exit code 0 in case all functions ran successfully', function() {
      hook.add(function() { return Promise.resolve() })
      hook.add(function() { return; })
      return hook.shutdown().then(function() {
        expect(exitSpy).to.be.calledWithExactly(0);
      });
    })

    it('should emit "ShutdownStarted" event when it is called', function() {
      var spy = sinon.spy();
      hook.on('ShutdownStarted', spy);
      return hook.shutdown().then(function() {
        expect(spy).to.be.calledOnce;
      })
    })

    it('should emit "ShutdownEnded" event when the shutdown operation finished successfully', function() {
      var spy = sinon.spy();
      hook.on('ShutdownEnded', spy);
      return hook.shutdown().then(function() {
        expect(spy).to.be.calledOnce;
        expect(spy).to.be.calledWithMatch({code: 0});
      })
    })

    it('should emit "ShutdownEnded" event when the shutdown operation failed', function() {
      var spy = sinon.spy();
      hook.add(function() { throw new Error('foo')})
      hook.on('ShutdownEnded', spy);
      return hook.shutdown().then(function() {
        expect(spy).to.be.calledOnce;
        expect(spy).to.be.calledWithMatch({code: 1});
        expect(spy.firstCall.args[0]).to.have.property('error');

        var error = spy.firstCall.args[0].error;
        expect(error).to.be.a("error");
        expect(error).to.have.property("message", "foo")
      })
    })

    it('should emit "ComponentShutdown" event for each shutdown function', function() {
      hook.add(function(){}, {name: "foo"});
      hook.add(function(){}, {order: 10});

      var spy = sinon.spy();
      hook.on('ComponentShutdown', spy);
      return hook.shutdown().then(function() {
        expect(spy).to.be.calledTwice;
        expect(spy.firstCall.args[0]).to.not.be.undefined;
        expect(spy.firstCall.args[0]).to.have.property("name", "foo");
        expect(spy.firstCall.args[0]).to.have.property("order", 0);
        expect(spy.firstCall.args[0]).to.have.property("index", 0);

        expect(spy.secondCall.args[0]).to.not.be.undefined;
        expect(spy.secondCall.args[0]).to.have.property("name");
        expect(spy.secondCall.args[0]).to.have.property("order", 10);
        expect(spy.secondCall.args[0]).to.have.property("index", 1);
      })
    })
  })

  describe('#register', function() {
    var shutdownSpy

    beforeEach(function() {
      hook = new ShutdownHook();
      hook.exit = sinon.spy();
      shutdownSpy = sinon.spy();
      hook.shutdown = shutdownSpy;
    })

    it('should call hook#shutdown on SIGTERM', function() {
      hook.register();
      process.emit('SIGTERM');
      expect(shutdownSpy).to.be.calledOn(hook);
    })

    it('should call hook#shutdown on SHUTDOWN message', function() {
      hook.register();
      process.emit('message', 'shutdown');
      expect(shutdownSpy).to.be.calledOn(hook);
    })

    // This test should always come last. SIGINT interrupts mocha and cancels any subsequent tests.
    it('should call hook#shutdown on SIGINT', function() {
      hook.register();
      process.emit('SIGINT');
      expect(shutdownSpy).to.be.calledOn(hook);
    })
  })

})
