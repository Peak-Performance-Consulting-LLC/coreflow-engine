import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeFilename(value: string) {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

function parseFileType(value: string) {
  if (value === 'image' || value === 'document' || value === 'attachment') {
    return value;
  }
  return '';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authContext = await authenticateRequest(request);
    if (authContext instanceof Response) {
      return authContext;
    }

    const form = await request.formData();
    const workspaceId = normalizeString(form.get('workspace_id'));
    const fileType = parseFileType(normalizeString(form.get('file_type')));
    const isLogo = normalizeString(form.get('is_logo')).toLowerCase() === 'true';
    const requestedName = normalizeString(form.get('filename'));
    const fileEntry = form.get('file');

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }
    if (!fileType) {
      return jsonResponse({ error: 'file_type must be image, document, or attachment.' }, 400);
    }
    if (!(fileEntry instanceof File)) {
      return jsonResponse({ error: 'file is required.' }, 400);
    }
    if (fileEntry.size <= 0) {
      return jsonResponse({ error: 'File cannot be empty.' }, 400);
    }
    if (fileEntry.size > 50 * 1024 * 1024) {
      return jsonResponse({ error: 'File must be 50MB or smaller.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const { error: createBucketError } = await authContext.serviceClient.storage.createBucket('email-assets', {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024,
    });

    if (createBucketError) {
      const lower = (createBucketError.message || '').toLowerCase();
      const alreadyExists = lower.includes('already') && lower.includes('exists');
      if (!alreadyExists) {
        throw new Error(createBucketError.message);
      }
    }

    const safeName = sanitizeFilename(requestedName || fileEntry.name || 'asset');
    const storagePath = `${workspaceId}/${fileType}/${Date.now()}-${safeName || 'asset'}`;
    const contentType = normalizeString(fileEntry.type) || undefined;

    const { error: uploadError } = await authContext.serviceClient.storage
      .from('email-assets')
      .upload(storagePath, fileEntry, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicData } = authContext.serviceClient.storage
      .from('email-assets')
      .getPublicUrl(storagePath);

    const { data: assetRow, error: insertError } = await authContext.serviceClient
      .from('email_template_assets')
      .insert({
        workspace_id: workspaceId,
        name: fileEntry.name || safeName || 'asset',
        file_type: fileType,
        mime_type: contentType || 'application/octet-stream',
        file_size: fileEntry.size,
        storage_path: storagePath,
        public_url: publicData.publicUrl,
        is_logo: isLogo,
        uploaded_by: authContext.user.id,
      })
      .select('*')
      .single();

    if (insertError) {
      await authContext.serviceClient.storage.from('email-assets').remove([storagePath]);
      throw new Error(insertError.message);
    }

    return jsonResponse({ asset: assetRow });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to upload file.';
    return jsonResponse({ error: message }, 400);
  }
});
