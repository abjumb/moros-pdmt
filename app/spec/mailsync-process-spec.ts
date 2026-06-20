import { formatMailsyncExitStatus } from '../src/mailsync-process';

describe('MailsyncProcess error formatting', () => {
  it('uses the signal when mailsync exits without a numeric code', () => {
    expect(formatMailsyncExitStatus(null, 'SIGTERM')).toBe('signal SIGTERM');
  });

  it('uses the code when mailsync exits with a numeric code', () => {
    expect(formatMailsyncExitStatus(1, null)).toBe('code 1');
  });
});
