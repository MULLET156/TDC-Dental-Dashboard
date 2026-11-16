'use strict';
// Talk to an http.Server inside this same process, without it listening on a
// port. Hostinger lets an app open only ONE listening server ("http.Server.listen()
// was called more than once, ignore"), so the built-in sample module runs this way.
const http = require('node:http');
const { Duplex } = require('node:stream');

// Two connected in-memory sockets: what one side writes, the other side reads.
function duplexPair() {
  let a = null;
  let b = null;
  const make = (other) => new Duplex({
    read() {},
    write(chunk, _enc, cb) { other().push(chunk); cb(); },
    final(cb) { other().push(null); cb(); },
    destroy(err, cb) { const o = other(); if (o && !o.destroyed) o.destroy(); cb(err); },
  });
  a = make(() => b);
  b = make(() => a);
  for (const s of [a, b]) {
    // net.Socket methods the HTTP code may call.
    s.setTimeout = () => s; s.setNoDelay = () => s; s.setKeepAlive = () => s; s.ref = () => s; s.unref = () => s;
    s.remoteAddress = '127.0.0.1'; s.remotePort = 0; s.localAddress = '127.0.0.1'; s.encrypted = false;
  }
  return [a, b];
}

// Like http.request, but the request goes straight into `server`.
function requestInProcess(server, { method, path, headers }) {
  return http.request({
    method, path, headers: { host: 'in-process', ...headers },
    createConnection: () => {
      const [client, serverSide] = duplexPair();
      server.emit('connection', serverSide);
      return client;
    },
  });
}

module.exports = { requestInProcess, duplexPair };
