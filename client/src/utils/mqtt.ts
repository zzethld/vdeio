/**
 * Renderer-side MQTT wrapper.
 * Delegates to Electron main process via IPC bridge.
 */

export interface MqttCommandData {
  command: string;
  payload?: Record<string, unknown>;
}

export const mqttBridge = {
  connect: (deviceId: string, token: string, brokerUrl?: string): Promise<{ success?: boolean; error?: string }> => {
    return window.electronAPI?.mqttConnect?.(deviceId, token, brokerUrl) ?? Promise.resolve({ error: 'Electron API not available' });
  },
  disconnect: (): Promise<{ success?: boolean; error?: string }> => {
    return window.electronAPI?.mqttDisconnect?.() ?? Promise.resolve({ error: 'Electron API not available' });
  },
  onCommand: (callback: (data: MqttCommandData) => void): (() => void) => {
    return window.electronAPI?.onMqttCommand?.(callback) ?? (() => {});
  },
};

export default mqttBridge;
