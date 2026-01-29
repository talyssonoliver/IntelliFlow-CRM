/**
 * Slack File Handlers
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { SlackConfig, SlackFile, UploadFileParams } from '../types';
import { SlackConnectionError, SlackInvalidRequestError } from '../errors';
import { makeRequest, getApiBaseUrl } from '../http-client';
import { mapToFile } from '../mappers';

export async function uploadFile(
  config: SlackConfig,
  params: UploadFileParams
): Promise<Result<SlackFile, DomainError>> {
  try {
    const formData = new FormData();
    formData.append('channels', params.channels.join(','));
    formData.append('filename', params.filename);

    if (typeof params.content === 'string') {
      formData.append('content', params.content);
    } else {
      formData.append('file', new Blob([params.content]), params.filename);
    }

    if (params.title) formData.append('title', params.title);
    if (params.initialComment) formData.append('initial_comment', params.initialComment);

    const response = await fetch(`${getApiBaseUrl()}/files.upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.botToken}`,
      },
      body: formData,
    });

    const data = (await response.json()) as {
      ok: boolean;
      error?: string;
      file?: Record<string, unknown>;
    };

    if (!data.ok) {
      return Result.fail(
        new SlackInvalidRequestError(data.error ?? 'File upload failed', data.error)
      );
    }

    return Result.ok(mapToFile(data.file as Record<string, unknown>));
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function deleteFile(
  config: SlackConfig,
  fileId: string
): Promise<Result<void, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/files.delete', { file: fileId });

    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(undefined);
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
