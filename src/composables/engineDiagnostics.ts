export function engineDiagnostics(status: Record<string, unknown> | null) {
  if (!status) return { badge: 'Standby', instance: 'Waiting for game tab…', sendMessage: 'Unknown', rpcHeaders: 'None detected' };
  const bridge = status.hasCanvas && status.hasRpcHeaders;
  return {
    badge: status.ready ? 'Connected' : bridge ? 'Active (RPC Bridge)' : status.hasCanvas ? 'Canvas Ready' : 'Waiting',
    instance: status.ready ? 'Active (In-Page WebGL)' : bridge ? 'Game Canvas Active (RPC Auth Connected)'
      : status.hasCanvas ? 'Canvas detected, awaiting RPC traffic…' : 'Game tab loading or not found',
    sendMessage: status.hasSendMessage ? 'Available (unityInstance.SendMessage)'
      : status.ready || bridge ? 'Not exposed by WebGL build' : status.hasCanvas ? 'Checking…' : 'Standby',
    rpcHeaders: status.hasRpcHeaders ? 'Active (Auth headers captured)' : status.rpcUrlAvailable
      ? 'RPC URL detected (needs refresh)' : 'None detected (reload game tab)',
  };
}
