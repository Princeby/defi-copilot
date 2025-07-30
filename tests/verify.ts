const { ApiPromise } = require('@polkadot/api');
const { WsProvider } = require('@polkadot/rpc-provider');
async function checkBalance() {
  const provider = new WsProvider('wss://westend-asset-hub-rpc.polkadot.io');
  const api = await ApiPromise.create({ provider });
  const { data: { free } } = await api.query.system.account('5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV');
  console.log(`Balance: ${free.toString() / 1e10} WND`);
  await api.disconnect();
}
checkBalance();