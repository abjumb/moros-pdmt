import { Message, Thread } from 'moros-exports';

export interface ThreadWithMessagesMetadata extends Thread {
  __messages: Message[];
}
