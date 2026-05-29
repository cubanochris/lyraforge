const { buildCaptureLeadTool } = require('../services/retellToolConfig');

test('builds a Retell custom tool spec with url, auth header and required params', () => {
  const tool = buildCaptureLeadTool({ id: 'abc' }, { baseUrl: 'https://app.example.com', secret: 's3cr3t' });
  expect(tool.type).toBe('custom');
  expect(tool.name).toBe('capture_lead');
  expect(tool.method).toBe('POST');
  expect(tool.url).toBe('https://app.example.com/api/functions/capture-lead');
  expect(tool.headers.Authorization).toBe('Bearer s3cr3t');
  expect(tool.parameters.required).toEqual(['name', 'phone']);
  expect(Object.keys(tool.parameters.properties)).toEqual(
    expect.arrayContaining(['name', 'phone', 'email', 'reason', 'preferred_callback_time'])
  );
});
