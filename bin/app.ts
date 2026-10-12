import * as cdk from "aws-cdk-lib"
import { FoosballStack } from "../infra/foosball-stack"

const apiKey = process.env.FOOSBALL_API_KEY
const signingSecret = process.env.SLACK_SIGNING_SECRET
const botToken = process.env.SLACK_BOT_TOKEN
if (!apiKey || !signingSecret || !botToken) {
  throw new Error("FOOSBALL_API_KEY, SLACK_SIGNING_SECRET, and SLACK_BOT_TOKEN are required")
}

const app = new cdk.App()
new FoosballStack(app, "Foosball", {
  apiKey,
  signingSecret,
  botToken,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
