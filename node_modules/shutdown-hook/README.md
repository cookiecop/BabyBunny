# Shutdown-Hook [![Build Status](https://travis-ci.org/shaharke/shutdown-hook.svg?branch=master)](https://travis-ci.org/shaharke/shutdown-hook)

Shutdown-Hook is an injectable shutdown hook (well dah..) module for Node.js applications.

## Installation
`npm install shutdown-hook`

## Usage

### Create a new instance:
```
const ShutdownHook = require('shutdown-hook')
let shutdownHook = new ShutdownHook(options)
```

#### Constructor Options:

| Property | Description | Default Value |
| :------: | :---------- | :-----------: |
| timeout  | Sets a timeout in ms for the shutdown operation to complete. If the shutdown operations exceed the timeout, the process will exit with code 1| 10000ms |


### Add shutdown functions:

`shutdownHook.add(_ => doSomething(), options)`

Shutdown functions are executed in the order they were added unless `options.order` was specified. Shutdown function should return nothing, a value, a Promise, or throw an error.
A rejected promise or error will stop the shutdown sequence (subsequent functions will not be run) and exit the process with code 1.

You can also name shutdown functions:

`shutdownHook.add('database', _ => doSomething(), {name: "foo"})`

This might be useful when listening to events (see below). If no name was given, the library auto-generates a name for consistency.

#### Options:

| Property | Description | Default Value |
| :------: | :---------- | :-----------: |
| name  | the name of the shutdown function. will be used when emitting events ||
| order | the order of the function is the shutdown sequence. functions are ordered in ascending order before execution | 0|


### Register to termination signals:

`shutdownHook.register()`

Registers the shutdown hook to trigger the shutdown sequence when receiving SIGTERM, SIGINT or `process.on('message', (m) => { m == 'shutdown' })`.

### Listen to shutdown sequence events:

```
shutdownHook.on('ShutdownStarted', (e) => log.info('it has began'))
shutdownHook.on('ComponentShutdown', (e) => log.info('shutting down one component'))
shutdownHook.on('ShutdownEnded', (e) => log.info('it has ended'))
```

#### Events structure:

| Event | Property | Type | Description | Optional |
| :---: | :------: | :--: | :---------- | :------: |
| ComponentShutdown | name | String | Name of the shutdown functions that's being executed| No|
|| order | Number | the order of the shutdown function in the sequence | No |
|| index | Number | the index of the shutdown function in the sequence | No |
| ShutdownEnded | code | Number | The exit code the library used when calling `process.exit()`| No |
|| error | Error | The error the library caught in case the sequence failed to run | Yes|



