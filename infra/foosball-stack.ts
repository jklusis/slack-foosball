import * as cdk from "aws-cdk-lib"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as lambda from "aws-cdk-lib/aws-lambda"
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs"
import * as logs from "aws-cdk-lib/aws-logs"
import { Construct } from "constructs"
import { MANAGED_BY_TAG } from "./tags"

export type FoosballStackProps = cdk.StackProps & {
  apiKey: string
  signingSecret: string
  botToken: string
}

export class FoosballStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FoosballStackProps) {
    super(scope, id, props)

    cdk.Tags.of(this).add(MANAGED_BY_TAG.key, MANAGED_BY_TAG.value)

    const games = new dynamodb.Table(this, "Games", {
      partitionKey: { name: "teamId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gameId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const players = new dynamodb.Table(this, "Players", {
      partitionKey: { name: "teamId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const controllerLogs = new logs.LogGroup(this, "ControllerLogs", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const controller = new NodejsFunction(this, "Controller", {
      entry: "src/lambda.ts",
      handler: "handler",
      // CDK 2.272 has no NODEJS_26_X constant yet. Lambda accepts this runtime name.
      runtime: new lambda.Runtime("nodejs26.x", lambda.RuntimeFamily.NODEJS),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      description: "Slack foosball controller",
      logGroup: controllerLogs,
      environment: {
        FOOSBALL_API_KEY: props.apiKey,
        SLACK_SIGNING_SECRET: props.signingSecret,
        SLACK_BOT_TOKEN: props.botToken,
        GAMES_TABLE: games.tableName,
        PLAYERS_TABLE: players.tableName,
      },
      bundling: {
        target: "node26",
        minify: false,
        sourceMap: false,
        forceDockerBundling: false,
      },
    })

    games.grantReadWriteData(controller)
    players.grantReadWriteData(controller)

    const endpoint = controller.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    })

    new cdk.CfnOutput(this, "FunctionUrl", { value: endpoint.url })
    new cdk.CfnOutput(this, "ApiKey", { value: props.apiKey })
    new cdk.CfnOutput(this, "SlackRequestUrl", {
      value: cdk.Fn.join("", [endpoint.url, "?key=", props.apiKey]),
    })
  }
}
