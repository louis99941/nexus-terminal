/**
 * Telnet 模块导出
 */

export { TelnetService } from './telnet.service';
export type { TelnetServiceOptions, TelnetConnectResult } from './telnet.service';

export { TelnetNegotiator } from './telnet-negotiation';

export {
  TELNET_IAC,
  TELNET_WILL,
  TELNET_WONT,
  TELNET_DO,
  TELNET_DONT,
  TELNET_SB,
  TELNET_SE,
  TELNET_OPTION_ECHO,
  TELNET_OPTION_SUPPRESS_GO_AHEAD,
  TELNET_OPTION_NAWS,
} from './telnet.types';

export type { TelnetParseResult, TelnetSocketState, ITelnetNegotiator } from './telnet.types';
