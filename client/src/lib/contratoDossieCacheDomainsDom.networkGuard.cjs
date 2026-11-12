'use strict';
// Complementa o guard do ambiente: esta suíte nem sequer aceita loopback/servidor.
const denied = () => { throw Object.assign(new Error('DOSSIE_DOM_NETWORK_FORBIDDEN'), {code: 'DOSSIE_DOM_NETWORK_FORBIDDEN'}); };
const net = require('node:net');
net.Socket.prototype.connect = denied;
net.Server.prototype.listen = denied;
for (const name of ['node:http', 'node:https']) {
  const mod = require(name);
  mod.request = denied;
  mod.get = denied;
}
require('node:tls').connect = denied;
require('node:dgram').createSocket = denied;
const dns = require('node:dns');
for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'reverse']) {
  dns[name] = denied;
  dns.promises[name] = async () => denied();
}
globalThis.fetch = async () => denied();
globalThis.WebSocket = denied;
require('node:module').syncBuiltinESMExports();
