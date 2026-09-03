# Super Productivity 中的插件消息通信

## iframe 插件如何接收消息

### 1. 插件在其 iframe（index.html）中注册消息处理器：

```javascript
// In the plugin's index.html
PluginAPI.onMessage(async (message) => {
  console.log('Plugin received message:', message);

  // Handle different message types
  if (message.type === 'updateBlockedSites') {
    // Update the plugin's state
    return { success: true, sites: message.sites };
  }

  return { error: 'Unknown message type' };
});
```

### 2. 宿主应用向插件发送消息：

```typescript
// From anywhere in the Super Productivity app
const pluginBridge = inject(PluginBridgeService);

const response = await pluginBridge.sendMessageToPlugin('procrastination-buster', {
  type: 'updateBlockedSites',
  sites: ['reddit.com', 'twitter.com'],
});
```

### 3. 消息流程：

1. 调用 `PluginBridgeService.sendMessageToPlugin()`
2. 委托给 `PluginRunner.sendMessageToPlugin()`
3. PluginRunner 找到 PluginAPI 实例并调用其 `__sendMessage()` 方法
4. 对于 iframe 插件，这会向 iframe 触发类型为 `PLUGIN_MESSAGE` 的 postMessage
5. iframe 的消息监听器（由 `onMessage` 设置）处理该消息
6. 响应通过类型为 `PLUGIN_MESSAGE_RESPONSE` 的 postMessage 回传
7. Promise 以该响应 resolve

### 4. 实现细节：

iframe 消息处理在 `plugin-iframe.util.ts` 中设置：

```javascript
// When onMessage is called in the iframe:
onMessage: (handler) => {
  window.__pluginMessageHandler = handler;
  window.addEventListener('message', async (event) => {
    if (event.data?.type === 'PLUGIN_MESSAGE' && window.__pluginMessageHandler) {
      try {
        const result = await window.__pluginMessageHandler(event.data.message);
        event.source?.postMessage(
          {
            type: 'PLUGIN_MESSAGE_RESPONSE',
            messageId: event.data.messageId,
            result,
          },
          '*',
        );
      } catch (error) {
        event.source?.postMessage(
          {
            type: 'PLUGIN_MESSAGE_ERROR',
            messageId: event.data.messageId,
            error: error.message,
          },
          '*',
        );
      }
    }
  });
};
```

不过，我注意到向 iframe 实际发送 `PLUGIN_MESSAGE` 在当前代码中并未实现。PluginAPI 上的 `__sendMessage` 方法对非 iframe 插件会直接调用处理器，但没有向 iframe post 消息的代码。

这看起来是实现中缺失的一环，需要补上才能完整 iframe 插件的消息通信系统。
