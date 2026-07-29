(function(global) {
const METHOD_PATH = '/baichuan.proto.api.al.robotics.arms.GeneralArmsControlService/GetLatestArmJointStates';

function encodeVarint(value) {
  const bytes = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining) byte |= 0x80;
    bytes.push(byte);
  } while (remaining);
  return bytes;
}

function readVarint(bytes, offset) {
  let value = 0;
  let shift = 0;
  while (offset < bytes.length && shift < 35) {
    const byte = bytes[offset++];
    value += (byte & 0x7f) * (2 ** shift);
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7;
  }
  throw new Error('无效的 protobuf varint');
}

function skipField(bytes, offset, wireType) {
  if (wireType === 0) return readVarint(bytes, offset).offset;
  if (wireType === 1) return offset + 8;
  if (wireType === 2) {
    const length = readVarint(bytes, offset);
    return length.offset + length.value;
  }
  if (wireType === 5) return offset + 4;
  throw new Error(`不支持的 protobuf wire type: ${wireType}`);
}

function decodeJointState(bytes) {
  const joint = { name: '', position: 0 };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    offset = tag.offset;
    const fieldNumber = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (fieldNumber === 1 && wireType === 2) {
      const length = readVarint(bytes, offset);
      offset = length.offset;
      joint.name = new TextDecoder().decode(bytes.subarray(offset, offset + length.value));
      offset += length.value;
    } else if (fieldNumber >= 2 && fieldNumber <= 4 && wireType === 5) {
      const value = view.getFloat32(offset, true);
      if (fieldNumber === 2) joint.position = value;
      if (fieldNumber === 3) joint.velocity = value;
      if (fieldNumber === 4) joint.effort = value;
      offset += 4;
    } else {
      offset = skipField(bytes, offset, wireType);
    }
    if (offset > bytes.length) throw new Error('JointState 数据长度无效');
  }
  return joint;
}

function encodeArmJointStatesRequest(armIndex) {
  if (!Number.isInteger(armIndex) || armIndex < 0) {
    throw new Error('机械臂编号必须是非负整数');
  }
  const message = armIndex === 0 ? [] : [0x08, ...encodeVarint(armIndex)];
  const frame = new Uint8Array(5 + message.length);
  new DataView(frame.buffer).setUint32(1, message.length, false);
  frame.set(message, 5);
  return frame;
}

function decodeJointStates(bytes) {
  const joints = [];
  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    offset = tag.offset;
    const fieldNumber = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (fieldNumber === 1 && wireType === 2) {
      const length = readVarint(bytes, offset);
      offset = length.offset;
      const end = offset + length.value;
      if (end > bytes.length) throw new Error('JointStates 数据长度无效');
      joints.push(decodeJointState(bytes.subarray(offset, end)));
      offset = end;
    } else {
      offset = skipField(bytes, offset, wireType);
    }
  }
  return joints;
}

function decodeGrpcMessage(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'));
  } catch {
    return value;
  }
}

function parseGrpcWebFrames(bytes) {
  const joints = [];
  let grpcStatus = '0';
  let grpcMessage = '';
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 5 > bytes.length) throw new Error('gRPC-Web 响应帧不完整');
    const flags = bytes[offset];
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false);
    offset += 5;
    const end = offset + length;
    if (end > bytes.length) throw new Error('gRPC-Web 响应帧长度无效');
    const payload = bytes.subarray(offset, end);
    if ((flags & 0x80) !== 0) {
      const trailers = new TextDecoder().decode(payload);
      for (const line of trailers.split(/\r?\n/)) {
        const separator = line.indexOf(':');
        if (separator < 0) continue;
        const name = line.slice(0, separator).trim().toLowerCase();
        const value = line.slice(separator + 1).trim();
        if (name === 'grpc-status') grpcStatus = value;
        if (name === 'grpc-message') grpcMessage = decodeGrpcMessage(value);
      }
    } else if ((flags & 1) !== 0) {
      throw new Error('暂不支持压缩的 gRPC-Web 响应');
    } else {
      joints.push(...decodeJointStates(payload));
    }
    offset = end;
  }
  if (grpcStatus !== '0') {
    throw new Error(grpcMessage || `gRPC 调用失败，状态码 ${grpcStatus}`);
  }
  return joints;
}

function responseBytes(arrayBuffer, contentType) {
  const bytes = new Uint8Array(arrayBuffer);
  if (!contentType.toLowerCase().includes('grpc-web-text')) return bytes;
  const base64 = new TextDecoder().decode(bytes).replace(/\s/g, '');
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function getLatestArmJointStates(baseUrl, armIndex, options = {}) {
  let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  if (!normalizedBaseUrl) throw new Error('请填写 gRPC-Web 网关地址');
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(normalizedBaseUrl)) {
    normalizedBaseUrl = 'http://' + normalizedBaseUrl;
  }
  const url = normalizedBaseUrl.endsWith(METHOD_PATH)
    ? normalizedBaseUrl
    : normalizedBaseUrl + METHOD_PATH;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/grpc-web+proto',
      'x-grpc-web': '1',
      'x-user-agent': 'grpc-web-javascript/0.1'
    },
    body: encodeArmJointStatesRequest(armIndex),
    signal: options.signal
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }
  const bytes = responseBytes(await response.arrayBuffer(), response.headers.get('content-type') || '');
  return parseGrpcWebFrames(bytes);
}

async function getLatestArmJointStatesViaLocalProxy(grpcUiUrl, armIndex, options = {}) {
  if (!Number.isInteger(armIndex) || armIndex < 0) {
    throw new Error('机械臂编号必须是非负整数');
  }
  const params = new URLSearchParams({
    armIndex:String(armIndex),
    grpcuiUrl:grpcUiUrl
  });
  const response = await fetch(`/api/latest-arm-joints?${params}`, {
    signal:options.signal
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok) {
    throw new Error(result.error || `本地接口返回 HTTP ${response.status}`);
  }
  if (!Array.isArray(result.joints)) throw new Error('本地接口未返回 joints 数据');
  return result.joints;
}

global.grpcArmJoints = {
  decodeJointStates,
  encodeArmJointStatesRequest,
  getLatestArmJointStates,
  getLatestArmJointStatesViaLocalProxy
};
})(window);
