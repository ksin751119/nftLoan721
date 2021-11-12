# Exit script as soon as a command fails.
set -o errexit

# Executes cleanup function at script exit.
trap cleanup EXIT

cleanup() {
    # kill the ganache instance that we started (if we started one and if it's still running).
    if [ -n "$ganache_pid" ] && ps -p $ganache_pid > /dev/null; then
        kill -9 $ganache_pid
    fi
}

ganache_port=8545

ganache_running() {
    nc -z localhost "$ganache_port"
}

start_ganache() {
    # TEST_MNEMONIC_PHRASE="gentle clown nuclear usual liberty clump limit theory ability border rib sort"

    DAI_PROVIDER="0x2a1530C4C41db0B0b2bB646CB5Eb1A67b7158667"

    node_modules/.bin/ganache-cli --gasLimit 0xfffffffffff --debug -f $ETH_MAINNET_NODE -u "$DAI_PROVIDER"  > /dev/null &

    ganache_pid=$!
}

if ganache_running; then
    echo "Using existing ganache instance"
else
    echo "Starting new ganache instance"
    start_ganache
fi

truffle version

# Execute rest test files with suffix `.test.js` with single `truffle test`
node_modules/.bin/truffle test "$@"
