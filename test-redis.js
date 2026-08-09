const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis(); // connects to localhost:6379
const myQueue = new Queue('testQueue', { connection });

async function main() {
  await myQueue.add('test', { foo: 'bar' });
  console.log('Job added to BullMQ!');
  await connection.quit();
}
main();
