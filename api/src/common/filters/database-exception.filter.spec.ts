import { ArgumentsHost, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { DatabaseExceptionFilter } from './database-exception.filter';

describe('DatabaseExceptionFilter', () => {
  function send(exception: unknown) {
    const response = { status: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;

    new DatabaseExceptionFilter().catch(exception, host);
    return { status: response.status.mock.calls[0][0], body: response.json.mock.calls[0][0] };
  }

  // The apps read `message` off the body; a bare JSON string has none.
  it('gives a string-built exception a { statusCode, message } body', () => {
    expect(send(new HttpException('Slow down.', HttpStatus.TOO_MANY_REQUESTS))).toEqual({
      status: 429,
      body: { statusCode: 429, message: 'Slow down.' },
    });
  });

  it("does the same for the rate limiter's 429", () => {
    expect(send(new ThrottlerException('Too many attempts.'))).toEqual({
      status: 429,
      body: { statusCode: 429, message: 'Too many attempts.' },
    });
  });

  it('sends an object-built exception as it is', () => {
    const { body } = send(new BadRequestException('Name is required'));
    expect(body).toEqual({ statusCode: 400, message: 'Name is required', error: 'Bad Request' });

    const coded = send(
      new HttpException({ statusCode: 403, message: 'No.', code: 'YOU_BLOCKED' }, 403),
    );
    expect(coded.body).toEqual({ statusCode: 403, message: 'No.', code: 'YOU_BLOCKED' });
  });
});
