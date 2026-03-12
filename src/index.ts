#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { z } from 'zod';

const N8N_HOST = process.env.N8N_HOST || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_API_KEY) {
  console.error("Error: N8N_API_KEY environment variable is required");
  process.exit(1);
}

const n8n = axios.create({
  baseURL: `${N8N_HOST}/api/v1`,
  headers: {
    'X-N8N-API-KEY': N8N_API_KEY,
  },
});

const webhookClient = axios.create({
  baseURL: N8N_HOST,
  headers: {
    'Content-Type': 'application/json',
  },
});

// n8n Community Templates API (public, no auth required)
const n8nTemplates = axios.create({
  baseURL: 'https://api.n8n.io/api/templates',
  headers: {
    'Content-Type': 'application/json',
  },
});

const server = new Server(
  {
    name: 'n8n-custom-mcp',
    version: '2.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      /* WORKFLOW MANAGEMENT */
      {
        name: 'list_workflows',
        description: 'List all workflows in n8n',
        inputSchema: {
          type: 'object',
          properties: {
            active: { type: 'boolean', description: 'Filter by active status' },
            limit: { type: 'number', description: 'Limit number of results' },
            tags: { type: 'string', description: 'Filter by tags (comma separated)' },
          },
        },
      },
      {
        name: 'get_workflow',
        description: 'Get detailed information about a workflow (nodes, connections, settings)',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The workflow ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'create_workflow',
        description: 'Create a new workflow',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the workflow' },
            nodes: { type: 'array', description: 'Array of node objects' },
            connections: { type: 'object', description: 'Object defining connections' },
            active: { type: 'boolean', description: 'Whether active' },
            settings: { type: 'object', description: 'Workflow settings' },
          },
          required: ['name'],
        },
      },
      {
        name: 'update_workflow',
        description: 'Update an existing workflow',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Workflow ID' },
            name: { type: 'string' },
            nodes: { type: 'array' },
            connections: { type: 'object' },
            active: { type: 'boolean' },
            settings: { type: 'object' },
          },
          required: ['id'],
        },
      },
      {
        name: 'delete_workflow',
        description: 'Delete a workflow',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Workflow ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'activate_workflow',
        description: 'Activate or deactivate a workflow',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Workflow ID' },
            active: { type: 'boolean', description: 'True to activate' },
          },
          required: ['id', 'active'],
        },
      },
      {
        name: 'duplicate_workflow',
        description: 'Duplicate (clone) an existing workflow. Creates a copy with all nodes, connections, and settings. The clone is created inactive by default. Useful for creating variations of existing workflows.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Source workflow ID to duplicate' },
            name: { type: 'string', description: 'Name for the new workflow (default: original name + " (Copy)")' },
          },
          required: ['id'],
        },
      },

      /* EXECUTION & TESTING */
      {
        name: 'execute_workflow',
        description: 'Manually trigger a workflow execution. Note: only works on active workflows or via internal API.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Workflow ID' },
            inputData: { type: 'object', description: 'Optional input data to pass to the workflow trigger node' },
          },
          required: ['id'],
        },
      },
      {
        name: 'trigger_webhook',
        description: 'Trigger a webhook endpoint for testing',
        inputSchema: {
          type: 'object',
          properties: {
            webhook_path: { type: 'string', description: 'Webhook path/UUID' },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'POST' },
            body: { type: 'object', description: 'JSON body payload' },
            test_mode: { type: 'boolean', description: 'Use /webhook-test/ endpoint if true' },
          },
          required: ['webhook_path'],
        },
      },

      /* DEBUGGING & MONITORING (NEW) */
      {
        name: 'list_executions',
        description: 'List recent workflow executions to check status',
        inputSchema: {
          type: 'object',
          properties: {
            includeData: { type: 'boolean', description: 'Include execution data' },
            status: { type: 'string', enum: ['error', 'success', 'waiting'] },
            limit: { type: 'number', default: 20 },
            workflowId: { type: 'string', description: 'Filter by workflow ID' },
          },
        },
      },
      {
        name: 'get_execution',
        description: 'Get full details of a specific execution for debugging',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Execution ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'get_execution_data',
        description: 'Get detailed per-node execution data for debugging. Shows what data each node received and produced, execution status, timing, and errors. Essential for identifying which node failed and why.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Execution ID' },
            nodeName: { type: 'string', description: 'Optional: filter to a specific node name to see only its data' },
            maxItems: { type: 'number', description: 'Max output items to return per node (default: 3, use higher for debugging specific data)', default: 3 },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_node_types',
        description: 'List all node types used across your n8n workflows. Returns unique node types with usage count and which workflows use them. Useful for discovering what integrations are available.',
        inputSchema: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Optional: filter node types by name (e.g. "http", "gmail", "slack")' },
          },
        },
      },

      /* COMMUNITY TEMPLATES */
      {
        name: 'search_templates',
        description: 'Search n8n community workflow templates from n8n.io. Returns template ID, name, description, nodes used, and view count. Use get_template to fetch the full workflow JSON for import.',
        inputSchema: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Search keyword (e.g. "webhook", "slack", "email automation")' },
            category: { type: 'string', description: 'Filter by category (e.g. "marketing", "sales", "engineering", "it-ops")' },
            rows: { type: 'number', description: 'Number of results to return (default: 10, max: 50)', default: 10 },
            page: { type: 'number', description: 'Page number for pagination (default: 1)', default: 1 },
          },
          required: ['search'],
        },
      },
      {
        name: 'get_template',
        description: 'Get full details of an n8n community template by ID, including the complete workflow JSON (nodes, connections) that can be used directly with create_workflow to import it.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Template ID from search_templates results' },
          },
          required: ['id'],
        },
      },

      /* CREDENTIALS MANAGEMENT */
      {
        name: 'get_credential_schema',
        description: 'Get credential type info by scanning your workflows for real usage examples. Shows which nodes use the credential type, how they are configured, and which workflows reference them. Use this before create_credential to understand credential types.',
        inputSchema: {
          type: 'object',
          properties: {
            credentialTypeName: { type: 'string', description: 'The credential type name to search for (e.g. "httpBasicAuth", "oAuth2Api", "gmail"). Supports partial match.' },
          },
          required: ['credentialTypeName'],
        },
      },
      {
        name: 'create_credential',
        description: 'Create a new credential in n8n. Use get_credential_schema first to know what fields are required for the credential type.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Display name for the credential (e.g. "My Gmail Account")' },
            type: { type: 'string', description: 'Credential type name (e.g. "httpBasicAuth", "gmailOAuth2Api")' },
            data: { type: 'object', description: 'Credential data fields as defined by the schema (e.g. { "user": "admin", "password": "secret" })' },
          },
          required: ['name', 'type', 'data'],
        },
      },
      {
        name: 'delete_credential',
        description: 'Delete a credential by its ID. Warning: workflows using this credential will break.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Credential ID to delete' },
          },
          required: ['id'],
        },
      },

      /* NODE TYPE DETAILS */
      {
        name: 'get_node_type_details',
        description: 'Get detailed information about a specific n8n node type by scanning existing workflows for real usage examples. Returns all unique parameter configurations, credential references, typeVersions, and the documentation URL. Use the full type name like "n8n-nodes-base.webhook" or a partial name like "webhook" for fuzzy search.',
        inputSchema: {
          type: 'object',
          properties: {
            nodeType: { type: 'string', description: 'Node type name (full: "n8n-nodes-base.webhook", or partial: "webhook", "httpRequest", "gmail")' },
          },
          required: ['nodeType'],
        },
      },

      /* TAG MANAGEMENT */
      {
        name: 'list_tags',
        description: 'List all tags in the n8n instance. Tags are used to organize and categorize workflows.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'create_tag',
        description: 'Create a new tag for organizing workflows.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tag name (e.g. "marketing", "production", "testing")' },
          },
          required: ['name'],
        },
      },
      {
        name: 'update_tag',
        description: 'Rename an existing tag.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Tag ID' },
            name: { type: 'string', description: 'New tag name' },
          },
          required: ['id', 'name'],
        },
      },
      {
        name: 'delete_tag',
        description: 'Delete a tag. This will remove the tag from all workflows that use it.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Tag ID to delete' },
          },
          required: ['id'],
        },
      },
      {
        name: 'tag_workflow',
        description: 'Assign tags to a workflow. Provide the full list of tag IDs — this replaces all existing tags on the workflow. Use list_tags first to get tag IDs.',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: { type: 'string', description: 'Workflow ID to tag' },
            tagIds: { type: 'array', items: { type: 'string' }, description: 'Array of tag IDs to assign (replaces existing tags)' },
          },
          required: ['workflowId', 'tagIds'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    // --- WORKFLOW CRUD ---
    if (name === 'list_workflows') {
      try {
        const { active, limit, tags } = args as any;
        const response = await n8n.get('/workflows', { params: { active, limit, tags } });
        const workflows = (response.data.data || []).map((w: any) => ({
          id: w.id, name: w.name, active: w.active,
          tags: w.tags?.map((t: any) => t.name),
          createdAt: w.createdAt, updatedAt: w.updatedAt,
        }));
        return { content: [{ type: 'text', text: JSON.stringify({ total: workflows.length, workflows }, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `List Workflows Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'get_workflow') {
      try {
        const { id } = args as any;
        const response = await n8n.get(`/workflows/${id}`);
        return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Get Workflow Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'create_workflow') {
      try {
        const response = await n8n.post('/workflows', args);
        return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Create Workflow Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'update_workflow') {
      try {
        const { id, ...data } = args as any;
        // n8n API requires 'name' in PUT body — auto-fetch if not provided
        if (!data.name) {
          const current = await n8n.get(`/workflows/${id}`);
          data.name = current.data.name;
        }
        const response = await n8n.put(`/workflows/${id}`, data);
        return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Update Workflow Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'delete_workflow') {
      try {
        const { id } = args as any;
        await n8n.delete(`/workflows/${id}`);
        return { content: [{ type: 'text', text: `Successfully deleted workflow ${id}` }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Delete Workflow Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'duplicate_workflow') {
      const { id, name: newName } = args as any;
      try {
        // Fetch original workflow
        const original = await n8n.get(`/workflows/${id}`);
        const wf = original.data;

        // Create clone: keep nodes, connections, settings; strip metadata
        const clone = {
          name: newName || `${wf.name} (Copy)`,
          nodes: wf.nodes,
          connections: wf.connections,
          settings: wf.settings,
          staticData: wf.staticData,
          active: false,
        };

        const created = await n8n.post('/workflows', clone);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              original: { id: wf.id, name: wf.name },
              duplicate: { id: created.data.id, name: created.data.name },
              hint: 'The duplicate is inactive. Use activate_workflow to enable it after making changes.',
            }, null, 2)
          }]
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Duplicate Workflow Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'activate_workflow') {
      try {
        const { id, active } = args as any;
        const response = await n8n.post(`/workflows/${id}/${active ? 'activate' : 'deactivate'}`);
        return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Activate Workflow Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    // --- EXECUTION ---
    if (name === 'execute_workflow') {
      const { id, inputData } = args as any;
      try {
        // Use the [MCP] Workflow Runner webhook to execute any workflow by ID
        const response = await webhookClient.post('/webhook/mcp-run-workflow', {
          workflowId: id,
          ...(inputData || {}),
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              workflowId: id,
              result: response.data,
              hint: 'Use list_executions or get_execution_data to inspect the execution details.',
            }, null, 2)
          }]
        };
      } catch (err: any) {
        const status = err.response?.status;
        const msg = err.response?.data?.message || err.message;
        let hint = '';
        if (status === 404) hint = ' The runner workflow may not be active. Check [MCP] Workflow Runner in n8n.';
        if (status === 500) hint = ' The target workflow may have errors. Use get_execution_data to debug.';
        return { isError: true, content: [{ type: 'text', text: `Execute Workflow Error: ${msg}${hint}` }] };
      }
    }

    if (name === 'trigger_webhook') {
      const { webhook_path, method = 'POST', body, test_mode } = args as any;
      const endpoint = test_mode ? '/webhook-test/' : '/webhook/';
      const url = `${endpoint}${webhook_path}`;
      
      try {
        const response = await webhookClient.request({
          method,
          url,
          data: body,
          validateStatus: () => true,
        });
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: response.status,
              statusText: response.statusText,
              data: response.data,
              url: `${N8N_HOST}${url}`
            }, null, 2)
          }]
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Webhook Error: ${err.message}` }] };
      }
    }

    // --- MONITORING ---
    if (name === 'list_executions') {
      try {
        const response = await n8n.get('/executions', { params: args });
        return { content: [{ type: 'text', text: JSON.stringify(response.data.data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `List Executions Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'get_execution') {
      try {
        const { id } = args as any;
        const response = await n8n.get(`/executions/${id}`);
        return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Get Execution Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'get_execution_data') {
      const { id, nodeName, maxItems = 3 } = args as any;
      try {
        const response = await n8n.get(`/executions/${id}`, { params: { includeData: true } });
        const exec = response.data;
        const runData = exec.data?.resultData?.runData;

        if (!runData) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'No execution data available. The execution may have been pruned or is still running.', executionId: id, status: exec.status }, null, 2) }] };
        }

        const nodeNames = Object.keys(runData);
        const filteredNames = nodeName
          ? nodeNames.filter(n => n.toLowerCase().includes(nodeName.toLowerCase()))
          : nodeNames;

        const nodeSummaries = filteredNames.map(nName => {
          const runs = runData[nName];
          return runs.map((run: any, idx: number) => {
            const outputData = run.data?.main?.[0] || [];
            const itemCount = outputData.length;
            const sampleItems = outputData.slice(0, maxItems).map((item: any) => item.json);
            const errorMessage = run.error?.message || null;

            return {
              nodeName: nName,
              runIndex: idx,
              executionStatus: run.executionStatus,
              startTime: run.startTime,
              executionTime: run.executionTime,
              itemCount,
              error: errorMessage,
              outputSample: sampleItems,
              ...(itemCount > maxItems ? { note: `Showing ${maxItems} of ${itemCount} items. Increase maxItems to see more.` } : {}),
            };
          });
        }).flat();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              executionId: id,
              status: exec.status,
              startedAt: exec.startedAt,
              stoppedAt: exec.stoppedAt,
              totalNodes: nodeNames.length,
              showingNodes: filteredNames.length,
              nodes: nodeSummaries,
            }, null, 2)
          }]
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Execution Data Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'list_node_types') {
      try {
        const { search } = args as any;
        // Scan all workflows to extract unique node types
        const allWorkflows: any[] = [];
        let cursor: string | undefined;
        do {
          const params: any = { limit: 100 };
          if (cursor) params.cursor = cursor;
          const resp = await n8n.get('/workflows', { params });
          allWorkflows.push(...(resp.data.data || []));
          cursor = resp.data.nextCursor;
        } while (cursor);

        // Count node types across all workflows
        const typeMap: Record<string, { count: number; workflows: string[] }> = {};
        for (const wf of allWorkflows) {
          if (!wf.nodes) continue;
          const seen = new Set<string>();
          for (const node of wf.nodes) {
            const t = node.type || '';
            if (!t) continue;
            if (!typeMap[t]) typeMap[t] = { count: 0, workflows: [] };
            typeMap[t].count++;
            if (!seen.has(t)) {
              seen.add(t);
              typeMap[t].workflows.push(wf.name);
            }
          }
        }

        let entries = Object.entries(typeMap);
        if (search) {
          const s = search.toLowerCase();
          entries = entries.filter(([type]) => type.toLowerCase().includes(s));
        }
        entries.sort((a, b) => b[1].count - a[1].count);

        const nodeTypes = entries.map(([type, info]) => ({
          type,
          shortName: type.split('.').pop(),
          instanceCount: info.count,
          usedInWorkflows: info.workflows.length,
          sampleWorkflows: info.workflows.slice(0, 3),
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              totalNodeTypes: nodeTypes.length,
              totalWorkflowsScanned: allWorkflows.length,
              nodeTypes,
            }, null, 2)
          }]
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `List Node Types Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    // --- COMMUNITY TEMPLATES ---
    if (name === 'search_templates') {
      const { search, category, rows = 10, page = 1 } = args as any;
      try {
        const params: any = { rows: Math.min(rows, 50), page };
        if (search) params.search = search;
        if (category) params.category = category;

        const response = await n8nTemplates.get('/search', { params });
        const { workflows, totalWorkflows } = response.data;

        // Return a clean summary for AI consumption
        const results = workflows.map((w: any) => ({
          id: w.id,
          name: w.name,
          description: w.description?.substring(0, 200),
          totalViews: w.totalViews,
          createdAt: w.createdAt,
          nodes: w.nodes?.map((n: any) => n.displayName || n.type),
          url: `https://n8n.io/workflows/${w.id}`,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              totalWorkflows,
              showing: results.length,
              page,
              workflows: results,
            }, null, 2)
          }]
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Templates Search Error: ${err.message}` }] };
      }
    }

    if (name === 'get_template') {
      const { id } = args as any;
      try {
        const response = await n8nTemplates.get(`/workflows/${id}`);
        const template = response.data.workflow;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              id: template.id,
              name: template.name,
              description: template.description,
              nodes: template.workflow?.nodes,
              connections: template.workflow?.connections,
              url: `https://n8n.io/workflows/${id}`,
              hint: 'Use create_workflow with the nodes and connections above to import this template.',
            }, null, 2)
          }]
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Template Fetch Error: ${err.message}` }] };
      }
    }

    // --- CREDENTIALS MANAGEMENT ---
    if (name === 'get_credential_schema') {
      const { credentialTypeName } = args as any;
      try {
        const searchTerm = credentialTypeName.toLowerCase();

        // Scan workflows to find credential type usage
        const allWorkflows: any[] = [];
        let cursor: string | undefined;
        do {
          const params: any = { limit: 100 };
          if (cursor) params.cursor = cursor;
          const resp = await n8n.get('/workflows', { params });
          allWorkflows.push(...(resp.data.data || []));
          cursor = resp.data.nextCursor;
        } while (cursor);

        const credentialTypeMap: Record<string, { nodes: string[]; workflows: string[] }> = {};

        for (const wf of allWorkflows) {
          if (!wf.nodes) continue;
          for (const node of wf.nodes) {
            if (!node.credentials) continue;
            for (const [credType, credInfo] of Object.entries(node.credentials as Record<string, any>)) {
              if (!credType.toLowerCase().includes(searchTerm)) continue;
              if (!credentialTypeMap[credType]) credentialTypeMap[credType] = { nodes: [], workflows: [] };
              const nodeDesc = `${node.name} (${node.type})`;
              if (!credentialTypeMap[credType].nodes.includes(nodeDesc)) {
                credentialTypeMap[credType].nodes.push(nodeDesc);
              }
              if (!credentialTypeMap[credType].workflows.includes(wf.name)) {
                credentialTypeMap[credType].workflows.push(wf.name);
              }
            }
          }
        }

        if (Object.keys(credentialTypeMap).length === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `No credential type matching "${credentialTypeName}" found in your workflows.`,
                hint: 'Try a broader search term, or use list_node_types to see what integrations are in use.',
                totalWorkflowsScanned: allWorkflows.length,
              }, null, 2)
            }]
          };
        }

        const results = Object.entries(credentialTypeMap).map(([credType, info]) => ({
          credentialType: credType,
          usedByNodes: info.nodes.slice(0, 10),
          usedInWorkflows: info.workflows.slice(0, 5),
          hint: `Use create_credential with type: "${credType}" to create a new credential of this type.`,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              totalMatches: results.length,
              credentialTypes: results,
              totalWorkflowsScanned: allWorkflows.length,
            }, null, 2)
          }]
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Credential Schema Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'create_credential') {
      const { name: credName, type, data } = args as any;
      try {
        const response = await n8n.post('/credentials', {
          name: credName,
          type,
          data,
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              credential: {
                id: response.data.id,
                name: response.data.name,
                type: response.data.type,
                createdAt: response.data.createdAt,
              },
              hint: 'Use this credential ID when configuring nodes in workflows.',
            }, null, 2)
          }]
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Create Credential Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'delete_credential') {
      const { id } = args as any;
      try {
        await n8n.delete(`/credentials/${id}`);
        return { content: [{ type: 'text', text: `Successfully deleted credential ${id}` }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Delete Credential Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    // --- NODE TYPE DETAILS ---
    if (name === 'get_node_type_details') {
      const { nodeType } = args as any;
      try {
        const searchTerm = nodeType.toLowerCase();

        // Fetch all workflows
        const allWorkflows: any[] = [];
        let cursor: string | undefined;
        do {
          const params: any = { limit: 100 };
          if (cursor) params.cursor = cursor;
          const resp = await n8n.get('/workflows', { params });
          allWorkflows.push(...(resp.data.data || []));
          cursor = resp.data.nextCursor;
        } while (cursor);

        // Find matching nodes across all workflows
        const matchingNodes: any[] = [];
        const workflowsUsing: { id: string; name: string }[] = [];

        for (const wf of allWorkflows) {
          if (!wf.nodes) continue;
          let found = false;
          for (const node of wf.nodes) {
            const type = (node.type || '').toLowerCase();
            if (type === searchTerm || type.includes(searchTerm)) {
              matchingNodes.push(node);
              found = true;
            }
          }
          if (found) {
            workflowsUsing.push({ id: wf.id, name: wf.name });
          }
        }

        if (matchingNodes.length === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `No nodes matching "${nodeType}" found in your workflows.`,
                hint: 'Try a different search term, or check n8n docs at https://docs.n8n.io/integrations/builtin/',
                totalWorkflowsScanned: allWorkflows.length,
              }, null, 2)
            }]
          };
        }

        // Extract unique info
        const nodeTypes = [...new Set(matchingNodes.map(n => n.type))];
        const typeVersions = [...new Set(matchingNodes.map(n => n.typeVersion))];
        const credentials = matchingNodes
          .filter(n => n.credentials)
          .map(n => n.credentials);
        const uniqueCredTypes = [...new Set(
          credentials.flatMap(c => Object.keys(c))
        )];

        // Get unique parameter structures (sample up to 5)
        const paramExamples = matchingNodes
          .slice(0, 5)
          .map(n => ({
            nodeName: n.name,
            type: n.type,
            typeVersion: n.typeVersion,
            parameters: n.parameters,
            credentials: n.credentials || null,
          }));

        // Build docs URL hint
        const primaryType = nodeTypes[0] || '';
        const parts = primaryType.split('.');
        const shortName = parts[parts.length - 1] || nodeType;
        const docsUrl = `https://docs.n8n.io/integrations/builtin/core-nodes/${primaryType}/`;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              nodeTypes,
              typeVersions,
              totalInstancesFound: matchingNodes.length,
              usedInWorkflows: workflowsUsing,
              credentialTypes: uniqueCredTypes,
              parameterExamples: paramExamples,
              docsUrl,
              hint: `Found ${matchingNodes.length} instances of "${nodeType}" across ${workflowsUsing.length} workflows. Parameter examples show real configurations from your n8n instance.`,
            }, null, 2)
          }]
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Node Type Details Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    // --- TAG MANAGEMENT ---
    if (name === 'list_tags') {
      try {
        const response = await n8n.get('/tags', { params: { limit: 100 } });
        const tags = (response.data.data || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }));
        return { content: [{ type: 'text', text: JSON.stringify({ totalTags: tags.length, tags }, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `List Tags Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'create_tag') {
      const { name: tagName } = args as any;
      try {
        const response = await n8n.post('/tags', { name: tagName });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, tag: { id: response.data.id, name: response.data.name } }, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Create Tag Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'update_tag') {
      const { id, name: newName } = args as any;
      try {
        const response = await n8n.put(`/tags/${id}`, { name: newName });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, tag: { id: response.data.id, name: response.data.name } }, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Update Tag Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'delete_tag') {
      const { id } = args as any;
      try {
        await n8n.delete(`/tags/${id}`);
        return { content: [{ type: 'text', text: `Successfully deleted tag ${id}` }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Delete Tag Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    if (name === 'tag_workflow') {
      const { workflowId, tagIds } = args as any;
      try {
        // Fetch current workflow to preserve nodes/connections
        const current = await n8n.get(`/workflows/${workflowId}`);
        const wf = current.data;

        // Update workflow with new tags
        const tags = tagIds.map((id: string) => ({ id }));
        const response = await n8n.put(`/workflows/${workflowId}`, {
          ...wf,
          tags,
        });

        const assignedTags = (response.data.tags || []).map((t: any) => ({ id: t.id, name: t.name }));
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              workflow: { id: response.data.id, name: response.data.name },
              tags: assignedTags,
            }, null, 2)
          }]
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Tag Workflow Error: ${err.response?.data?.message || err.message}` }] };
      }
    }

    throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message;
    return { isError: true, content: [{ type: 'text', text: `N8N API Error: ${errorMsg}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
