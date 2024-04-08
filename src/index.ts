import { ZodError, ZodType, number, z } from "zod";

export const OutputFileType = z.object({
  url: z.string(),
  filename: z.string(),
})

const status = z.enum([
  "not-started",
  "running",
  "uploading",
  "success",
  "failed",
  "started",
  "queued",
  "timeout",
])

const runOutputs = z.array(z.object({
  data: z.object({
    images: z.array(OutputFileType).optional(),
    files: z.array(OutputFileType).optional(),
    gifs: z.array(OutputFileType).optional(),
  })
}))

export const WebookRequestBody = z.object({
  status: status,
  run_id: z.string(),
  outputs: runOutputs,
});

export async function parseWebhookDataSafe(
  request: Request,
  headers?: HeadersInit,
): Promise<[z.infer<typeof WebookRequestBody> | undefined, Response | undefined]> {
  return parseDataSafe(WebookRequestBody, request, headers);
}

async function parseDataSafe<T extends ZodType<any, any, any>>(
  schema: T,
  request: Request,
  headers?: HeadersInit,
): Promise<[z.infer<T> | undefined, Response | undefined]> {
  let data: z.infer<T> | undefined = undefined;
  try {
    if (request.method === "GET") {
      // Parse data from query parameters for GET requests
      const url = new URL(request.url);
      const params = Object.fromEntries(url.searchParams);
      data = await schema.parseAsync(params);
    } else {
      // Parse data from request body for other types of requests
      data = await schema.parseAsync(await request.json());
    }
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      const message = e.flatten().fieldErrors;
      return [
        undefined,
        Response.json(message, {
          status: 500,
          statusText: "Invalid request",
          headers: headers,
        }),
      ];
    }
  }

  if (!data)
    return [
      undefined,
      Response.json(
        {
          message: "Invalid request",
        },
        { status: 500, statusText: "Invalid request", headers: headers },
      ),
    ];

  return [data, undefined];
}


const runTypes = z.object({
  run_id: z.string(),
});


const runOutputTypes = z.object({
  id: z.string(),
  status: status,
  outputs: runOutputs,
  live_status: z.string().optional().nullable(),
  progress: number().default(0)
});

const uploadFileTypes = z.object({
  upload_url: z.string(),
  file_id: z.string(),
  download_url: z.string(),
});

const getWebsocketTypes = z.object({
  ws_connection_url: z.string(),
  // auth_token: z.string(),
  // get_workflow_endpoint_url: z.string(),
})

export class ComfyDeployClient {
  apiBase: string = "https://www.comfydeploy.com/api";
  apiToken: string;

  constructor({ apiBase, apiToken }: { apiBase?: string; apiToken: string }) {
    if (apiBase) {
      this.apiBase = `${apiBase}/api`;
    }
    this.apiToken = apiToken;
  }

  async run({
    deployment_id,
    inputs,
    webhook,
  }: {
    deployment_id: string;
    inputs?: Record<string, string>;
    webhook?: string;
  }) {
    return fetch(`${this.apiBase}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify({
        deployment_id: deployment_id,
        inputs: inputs,
        webhook: webhook,
      }),
      cache: "no-store",
    })
      .then((response) => {
        // console.log('response', response)
        return response.json()
      })
      .then((json) => {
        // console.log('json', json)
        return runTypes.parse(json)
      })
      .catch((err) => {
        console.error('err', err);
        return null;
      });
  }

  async getRun(run_id: string) {
    return await fetch(`${this.apiBase}/run?run_id=${run_id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${this.apiToken}`,
      },
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((json) => runOutputTypes.parse(json))
      .catch((err) => {
        console.error(err);
        return null;
      });
  }

  async runSync(props: {
    deployment_id: string;
    inputs?: Record<string, string>;
    webhook?: string;
  }) {
    const runResult = await this.run(props);
    if (!runResult) return null;

    // 5 minutes
    const timeout = 60 * 5;
    const interval = 1000;

    let run: Awaited<ReturnType<typeof this.getRun>> = null;
    for (let i = 0; i < timeout; i++) {
      run = await this.getRun(runResult.run_id);
      if (run && run.status == "success") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    if (!run) {
      return {
        id: runResult.run_id,
      };
    }

    return run;
  }

  async getUploadUrl(type: string, file_size: number) {
    const obj = {
      type: type,
      file_size: file_size.toString(),
    };
    const url = new URL(`${this.apiBase}/upload-url`);
    url.search = new URLSearchParams(obj).toString();

    return await fetch(url.href, {
      method: "GET",
      headers: {
        authorization: `Bearer ${this.apiToken}`,
      },
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((json) => uploadFileTypes.parse(json))
      .catch((err) => {
        console.error(err);
        return null;
      });
  }

  async getWebsocketUrl({ deployment_id }: { deployment_id: string; }) {
    const url = new URL(`${this.apiBase}/websocket/${deployment_id}`);

    return await fetch(url.href, {
      method: "GET",
      headers: {
        authorization: `Bearer ${this.apiToken}`,
      },
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((json) => getWebsocketTypes.parse(json))
      .catch((err) => {
        console.error(err);
        return null;
      });
  }
}
