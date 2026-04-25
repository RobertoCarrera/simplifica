import { LambdaClient, UpdateFunctionCodeCommand } from '@aws-sdk/client-lambda';
import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

async function run() {
  console.log('--- AWS Lambda Deployer (Simplified) ---');

  const accessKeyId = await ask('Enter your AWS Access Key ID: ');
  const secretAccessKey = await ask('Enter your AWS Secret Access Key: ');
  const region = (await ask('Enter your AWS Region (default: eu-west-3): ')) || 'eu-west-3';
  const functionName =
    (await ask('Enter your Lambda Function Name (default: ses-email-forwarder): ')) ||
    'ses-email-forwarder';
  const zipFile = 'lambda-inbound.zip';

  if (!fs.existsSync(zipFile)) {
    console.error(`Error: ${zipFile} not found in the current directory.`);
    process.exit(1);
  }

  const client = new LambdaClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  try {
    console.log(`Uploading ${zipFile} to function ${functionName}...`);
    const zipData = fs.readFileSync(zipFile);

    const command = new UpdateFunctionCodeCommand({
      FunctionName: functionName,
      ZipFile: zipData,
    });

    const response = await client.send(command);
    console.log('--- Success! ---');
    console.log(`Function ${functionName} updated to version: ${response.Version}`);
    console.log(`Last update status: ${response.LastUpdateStatus}`);
  } catch (err) {
    console.error('--- Error ---');
    console.error(err.message);
  } finally {
    rl.close();
  }
}

run();
