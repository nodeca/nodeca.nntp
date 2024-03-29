// Initialize (start) NNTP server
//

'use strict';


const _             = require('lodash');
const cluster       = require('cluster');
const { readFile }  = require('fs/promises');
const { watchFile } = require('fs');
const Server        = require('nntp-server');
const os            = require('os');
const path          = require('path');
const url           = require('url');
const WorkerPool    = require('nodeca.core/lib/system/worker_pool');


function extractBindings(config) {
  let result = {};

  // Collect non-SSL bindings.
  if (!result[config.listen]) {
    let [ address, port ] = config.listen.split(':', 2);

    result[config.listen] = { address, port, ssl: null };
  }

  // Collect SSL bindings.
  if (config.ssl) {
    if (!result[config.ssl.listen]) {
      let [ address, port ] = config.ssl.listen.split(':', 2);

      result[config.ssl.listen] = {
        address,
        port,
        ssl: _.omit(config.ssl, 'listen')
      };
    }
  }

  return result;
}


module.exports = function (N) {

  let active_pools = [];

  N.wire.on('init:services', { parallel: true }, async function worker_pool_nntp_init(N) {
    let fork = (N.config.fork ?? {}).nntp;

    if (fork === 'auto') {
      fork = os.cpus().length;
    } else {
      fork = +fork || 0;
    }

    if (!cluster.isMaster || fork < 1) {
      // single process mode
      await N.wire.emit('init:services.nntp', N);
      return;
    }

    let pool = new WorkerPool('nntp', fork);

    active_pools.push(pool);

    pool.on('worker:spawn',  pid         => N.logger.info(`Worker ${pid} spawned`));
    pool.on('worker:error',  error       => N.logger.error(error));
    pool.on('worker:online', pid         => N.logger.info(`Worker ${pid} is running`));
    pool.on('worker:exit',   (pid, code) => N.logger.info(`Worker ${pid} exited with status ${code}`));

    N.wire.on('exit.shutdown', { ensure: true, parallel: true }, function shutdown_http_pool() {
      pool.shutdown();

      return new Promise(resolve => pool.once('exit', resolve));
    });

    N.wire.on('exit.terminate', { ensure: true, parallel: true }, function terminate_http_pool() {
      pool.terminate();

      return new Promise(resolve => pool.once('exit', resolve));
    });

    N.wire.on('reload', function reload_http_pool() {
      pool.reload();
    });

    await new Promise((resolve, reject) => {
      // Wait for either 'online' or 'error' events,
      // whichever comes first
      //
      let on_error, on_online;

      on_online = function () {
        pool.removeListener('online', on_online);
        pool.removeListener('error', on_error);

        resolve();
      };

      on_error = function (error) {
        pool.removeListener('online', on_online);
        pool.removeListener('error', on_error);

        reject(error);
      };

      pool.on('online', on_online);
      pool.on('error',  on_error);
    });

    N.logger.info('Nntp workers started successfully');
  });


  N.wire.on('init:services.list', function worker_pool_http_list(data) {
    for (let pool of active_pools) data.push(pool);
  });


  let servers = [];


  N.wire.on('init:services.nntp', async function server_bind(N) {
    let bindings = extractBindings(N.config.nntp ?? {});
    let bindingNames = Object.keys(bindings);

    async function bindServer(name) {
      let { address, port, ssl } = bindings[name];
      let files = {};

      if (ssl) {
        for (let val of [ 'key', 'cert' ]) {
          if (!ssl[val]) {
            N.logger.error(`${val}-file is not specified in SSL config`);
            return;
          }

          let filename = path.resolve(N.mainApp.root, ssl[val]);

          try {
            ssl[val] = await readFile(filename, 'utf8');
          } catch (err) {
            N.logger.error(`Can't read ${val}-file from SSL config (${filename}): ${err}`);
            return;
          }

          files[val] = filename;
        }
      }

      let nntp = new Server({ tls: ssl, secure: !!ssl });

      servers.push(nntp);

      let u = url.format({
        protocol: ssl ? 'nntps:' : 'nntp:',
        slashes:  true,
        hostname: address,
        port
      });

      async function reload_cert() {
        N.logger.info('Reloading NNTP certificates');

        let creds = {};

        for (let val of [ 'key', 'cert' ]) {
          try {
            creds[val] = await readFile(files[val], 'utf8');
          } catch (err) {
            N.logger.error(`Can't read ${val}-file from SSL config (${files[val]}): ${err}`);
            return;
          }
        }

        try {
          nntp.server.setSecureContext(Object.assign({}, ssl, creds));
        } catch (err) {
          N.logger.error(`Can't parse NNTP certificates: ${err}`);
        }
      }

      if (ssl) {
        watchFile(files.key,  { persistent: false, interval: 1000 }, reload_cert);
        watchFile(files.cert, { persistent: false, interval: 1000 }, reload_cert);
      }

      // Emit sub event and try to bind to the port after that.
      return N.wire.emit('init:server.nntp', nntp)
        .then(() => nntp.listen(u))
        .catch(err => {

          let err_prefix = `Can't bind to <${address}> with port <${port}>: `;

          switch (err.code) {
            case 'EADDRINUSE':
              throw err_prefix + 'Address in use...';

            case 'EADDRNOTAVAIL':
              throw err_prefix + 'Address is not available...';

            case 'ENOENT':
              throw err_prefix + 'Failed to resolve IP address...';
          }

          // unknown error
          throw err_prefix + err;
        }).then(() => {
          // Notify that we started listening
          N.logger.info(`Listening on ${address}:${port} NNTP ${ssl ? 'SSL' : 'NON-SSL'}`);
        });
    }

    // Bind web servers
    for (let i = 0; i < bindingNames.length; i++) {
      await bindServer(bindingNames[i]);
    }
  });


  N.wire.on('exit.shutdown', { ensure: true, parallel: true }, function close_http_server() {
    let promises = servers.map(nntp => nntp.close());

    return Promise.all(promises);
  });
};
