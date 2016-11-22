'use strict';

const chai = require('chai');
const dirtyChai = require('dirty-chai');
const ServerlessBuilder = require('../support/ServerlessBuilder');
const OffLineBuilder = require('../support/OffLineBuilder');

const expect = chai.expect;
chai.use(dirtyChai);

describe('Offline', () => {
  let offline;

  before(() => {
    // Creates offline test server with no function
    offline = new OffLineBuilder(new ServerlessBuilder()).toObject();
  });

  context('with a non existing route', () => {
    it('should return 404', () => {
      offline.inject({
        method: 'GET',
        url: '/magic',
      }, (res) => {
        expect(res.statusCode).to.eq(404);
      });
    });
  });

  context('with an exiting lambda-proxy integration type route', () => {
    it('should return the expected status code', (done) => {
      const offLine = new OffLineBuilder().addFunctionConfig('fn1', {
        handler: 'handler.hello',
        events: [{
          http: {
            path: 'fn1',
            method: 'GET',
          },
        }],
      }, (event, context, cb) => cb(null, {
        statusCode: 201,
        body: null,
      })).toObject();

      offLine.inject({
        method: 'GET',
        url: '/fn1',
      }, (res) => {
        expect(res.statusCode).to.eq(201);
        done();
      });
    });
  });

  context('with private function', () => {
    let offLine;

    before((done) => {
      offLine = new OffLineBuilder().addFunctionConfig('fn2', {
        handler: 'handler.basicAuthentication',
        events: [{
          http: {
            path: 'fn2',
            method: 'GET',
            private: true,
          },
        }],
      }, (event, context, cb) => {
        const response = {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Private Function Executed Correctly',
          }),
        };
        cb(null, response);
      }).addApiKeys(['token']).toObject();
      done();
    });

    it('should return bad request with no token', (done) => {
      offLine.inject({
        method: 'GET',
        url: '/fn2',
      }, (res) => {
        expect(res.statusCode).to.eq(403);
        expect(res.payload).to.eq(JSON.stringify({ message: 'Forbidden' }));
        expect(res.headers).to.have.property('x-amzn-errortype', 'ForbiddenException');
        done();
      });
    });

    it('should return forbidden if token is wrong', (done) => {
      offLine.inject({
        method: 'GET',
        url: '/fn2',
        headers: { 'x-api-key': 'random string' },
      }, (res) => {
        expect(res.statusCode).to.eq(403);
        expect(res.payload).to.eq(JSON.stringify({ message: 'Forbidden' }));
        expect(res.headers).to.have.property('x-amzn-errortype', 'ForbiddenException');
        done();
      });
    });

    it('should return the function executed correctly', (done) => {
      let token;
      if (process.env.tokens instanceof Array) {
        token = process.env.tokens[0];
      } else {
        token = process.env.tokens;
      }
      const handler = {
        method: 'GET',
        url: '/fn2',
        headers: { 'x-api-key': token },
      };
      offLine.inject(handler, (res) => {
        expect(res.statusCode).to.eq(200);
        expect(res.payload).to.eq(JSON.stringify({ message: 'Private Function Executed Correctly' }));
        done();
      });
    });

  });

  context('lambda integration, handling response templates', () => {
    it('should use event defined response template and headers', (done) => {
      const offLine = new OffLineBuilder().addFunctionConfig('index', {
        handler: 'users.index',
        events: [{
          http: {
            path: 'index',
            method: 'GET',
            integration: 'lambda',
            response: {
              headers: {
                'Content-Type': "'text/html'",
              },
              template: "$input.path('$')",
            },
          },
        }],
      }, (event, context, cb) => cb(null, 'Hello World')).toObject();

      offLine.inject('/index', (res) => {
        expect(res.headers['content-type']).to.contains('text/html');
        expect(res.statusCode).to.eq('200');
        done();
      });
    });
  });

  context('lambda integration, parse [xxx] as status codes in errors', () => {
    it('should set the status code to 500 when no [xxx] is present', (done) => {
      const offLine = new OffLineBuilder().addFunctionConfig('index', {
        handler: 'users.index',
        events: [{
          http: {
            path: 'index',
            method: 'GET',
            integration: 'lambda',
            response: {
              headers: {
                'Content-Type': "'text/html'",
              },
              template: "$input.path('$')",
            },
          },
        }],
      }, (event, context, cb) => cb(new Error('Internal Server Error'))).toObject();

      offLine.inject('/index', (res) => {
        expect(res.headers['content-type']).to.contains('text/html');
        expect(res.statusCode).to.eq('500');
        done();
      });
    });

    it('should set the status code to 401 when [401] is the prefix of the error message', (done) => {
      const offLine = new OffLineBuilder().addFunctionConfig('index', {
        handler: 'users.index',
        events: [{
          http: {
            path: 'index',
            method: 'GET',
            integration: 'lambda',
            response: {
              headers: {
                'Content-Type': "'text/html'",
              },
              template: "$input.path('$')",
            },
          },
        }],
      }, (event, context, cb) => cb(new Error('[401] Unauthorized'))).toObject();

      offLine.inject('/index', (res) => {
        expect(res.headers['content-type']).to.contains('text/html');
        expect(res.statusCode).to.eq('401');
        done();
      });
    });
  });

  context('lambda-proxy integration', () => {
    it('should return application/json content type by default', (done) => {
      const offLine = new OffLineBuilder()
        .addFunctionHTTP('fn1', {
          path: 'fn1',
          method: 'GET',
        }, (event, context, cb) => cb(null, {
          statusCode: 200,
          body: JSON.stringify({ data: 'data' }),
        })).toObject();

      offLine.inject({
        method: 'GET',
        url: '/fn1',
      }, (res) => {
        expect(res.headers).to.have.property('content-type', 'application/json');
        done();
      });
    });

    it('should return the expected status code', (done) => {
      const offLine = new OffLineBuilder().addFunctionHTTP('hello', {
        path: 'fn1',
        method: 'GET',
      }, (event, context, cb) => cb(null, {
        statusCode: 201,
        body: null,
      })).toObject();

      offLine.inject({
        method: 'GET',
        url: '/fn1',
      }, (res) => {
        expect(res.statusCode).to.eq(201);
        done();
      });
    });

    context('with the stageVariables plugin', () => {
      it('should handle custom stage variables declaration', (done) => {
        const offLine = new OffLineBuilder().addCustom('stageVariables', { hello: 'Hello World' }).addFunctionHTTP('hello', {
          path: 'fn1',
          method: 'GET',
        }, (event, context, cb) => cb(null, {
          statusCode: 201,
          body: event.stageVariables.hello,
        })).toObject();

        offLine.inject({
          method: 'GET',
          url: '/fn1',
        }, (res) => {
          expect(res.payload).to.eq('Hello World');
          done();
        });
      });
    });
  });
});
