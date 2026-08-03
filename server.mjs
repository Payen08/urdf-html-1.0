import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8000;
const defaultGrpcUiUrl = 'http://172.31.22.123:6700/grpcui/';
const serviceName = 'baichuan.proto.api.al.robotics.arms.GeneralArmsControlService';
const methodName = 'GetLatestArmJointStates';
const grpcUiSessionTtlMs = 5 * 60 * 1000;
const grpcUiSessions = new Map();

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png'
};

function jsonResponse(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function getGrpcUiSession(baseUrl, forceRefresh = false) {
  const cacheKey = baseUrl.href;
  const cached = grpcUiSessions.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached;

  const pageResponse = await fetch(baseUrl, { signal: AbortSignal.timeout(10000) });
  if (!pageResponse.ok) throw new Error(`grpcui 页面返回 HTTP ${pageResponse.status}`);
  const setCookie = pageResponse.headers.get('set-cookie') || '';
  const tokenMatch = setCookie.match(/_grpcui_csrf_token=([^;]+)/);
  if (!tokenMatch) throw new Error('grpcui 未返回 CSRF Token');
  const session = {
    csrfToken: tokenMatch[1],
    expiresAt: Date.now() + grpcUiSessionTtlMs
  };
  grpcUiSessions.set(cacheKey, session);
  return session;
}

async function getLatestArmJointStates(grpcUiUrl, armIndex) {
  const baseUrl = new URL(grpcUiUrl || defaultGrpcUiUrl);
  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new Error('grpcui 地址只支持 HTTP 或 HTTPS');
  }
  if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';

  const invokeUrl = new URL(`invoke/${serviceName}.${methodName}`, baseUrl);
  for (let attempt = 0; attempt < 2; attempt++) {
    const { csrfToken } = await getGrpcUiSession(baseUrl, attempt > 0);
    const invokeResponse = await fetch(invokeUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cookie': `_grpcui_csrf_token=${csrfToken}`,
        'x-grpcui-csrf-token': csrfToken
      },
      body: JSON.stringify({
        timeout_seconds: 10,
        metadata: [],
        data: [{ armIndex }]
      }),
      signal: AbortSignal.timeout(15000)
    });
    if ((invokeResponse.status === 401 || invokeResponse.status === 403) && attempt === 0) {
      grpcUiSessions.delete(baseUrl.href);
      continue;
    }
    if (!invokeResponse.ok) throw new Error(`grpcui 调用返回 HTTP ${invokeResponse.status}`);
    const result = await invokeResponse.json();
    if (result.error) throw new Error(result.error.message || String(result.error));
    const message = result.responses?.find(item => !item.isError)?.message;
    if (!Array.isArray(message?.joints)) throw new Error('grpcui 响应中没有 joints 数据');
    return message.joints;
  }
  throw new Error('grpcui 会话已失效');
}

async function serveStatic(requestUrl, response) {
  const pathname = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
  const filePath = path.resolve(rootDir, `.${pathname}`);
  if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      'content-type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    });
    response.end(content);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500);
    response.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
  if (requestUrl.pathname === '/api/latest-arm-joints') {
    const armIndex = Number(requestUrl.searchParams.get('armIndex'));
    if (!Number.isInteger(armIndex) || armIndex < 0) {
      jsonResponse(response, 400, { error: 'armIndex 必须是非负整数' });
      return;
    }
    try {
      const joints = await getLatestArmJointStates(
        requestUrl.searchParams.get('grpcuiUrl') || defaultGrpcUiUrl,
        armIndex
      );
      jsonResponse(response, 200, { joints });
    } catch (error) {
      jsonResponse(response, 502, { error: error.message });
    }
    return;
  }
  await serveStatic(requestUrl, response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`URDF viewer: http://127.0.0.1:${port}`);
});
