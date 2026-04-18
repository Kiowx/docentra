export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
}

export const spreadsheetTools: ToolDefinition[] = [
  {
    name: 'set_cell',
    description: 'Set the value of a single cell. Row and column are 0-indexed (row 0 is the first row, col 0 is column A).',
    parameters: {
      type: 'object',
      properties: {
        row: {
          type: 'integer',
          description: 'Row index (0-based)',
        },
        col: {
          type: 'integer',
          description: 'Column index (0-based)',
        },
        value: {
          type: 'string',
          description: 'The value to set in the cell',
        },
      },
      required: ['row', 'col', 'value'],
    },
  },
  {
    name: 'set_range',
    description: 'Set values for a rectangular range of cells starting at the given row and column. Data is a 2D array where each sub-array is a row.',
    parameters: {
      type: 'object',
      properties: {
        startRow: {
          type: 'integer',
          description: 'Starting row index (0-based)',
        },
        startCol: {
          type: 'integer',
          description: 'Starting column index (0-based)',
        },
        data: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'string' },
          },
          description: '2D array of cell values (each sub-array is a row)',
        },
      },
      required: ['startRow', 'startCol', 'data'],
    },
  },
  {
    name: 'add_row',
    description: 'Insert one or more blank rows at the specified index. Existing rows at and after the index are shifted down.',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'integer',
          description: 'Row index where new rows should be inserted (0-based)',
        },
        count: {
          type: 'integer',
          description: 'Number of rows to insert',
          default: 1,
        },
      },
      required: ['index'],
    },
  },
  {
    name: 'add_column',
    description: 'Insert one or more blank columns at the specified index. Existing columns at and after the index are shifted right.',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'integer',
          description: 'Column index where new columns should be inserted (0-based)',
        },
        count: {
          type: 'integer',
          description: 'Number of columns to insert',
          default: 1,
        },
      },
      required: ['index'],
    },
  },
  {
    name: 'delete_row',
    description: 'Delete one or more rows starting at the specified index. Rows below are shifted up.',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'integer',
          description: 'Row index to start deleting (0-based)',
        },
        count: {
          type: 'integer',
          description: 'Number of rows to delete',
          default: 1,
        },
      },
      required: ['index'],
    },
  },
  {
    name: 'delete_column',
    description: 'Delete one or more columns starting at the specified index. Columns to the right are shifted left.',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'integer',
          description: 'Column index to start deleting (0-based)',
        },
        count: {
          type: 'integer',
          description: 'Number of columns to delete',
          default: 1,
        },
      },
      required: ['index'],
    },
  },
  {
    name: 'format_cells',
    description: 'Apply formatting to a rectangular range of cells. Supports bold, italic, underline, alignment, and colors.',
    parameters: {
      type: 'object',
      properties: {
        startRow: {
          type: 'integer',
          description: 'Starting row index (0-based)',
        },
        startCol: {
          type: 'integer',
          description: 'Starting column index (0-based)',
        },
        endRow: {
          type: 'integer',
          description: 'Ending row index (0-based, inclusive)',
        },
        endCol: {
          type: 'integer',
          description: 'Ending column index (0-based, inclusive)',
        },
        format: {
          type: 'object',
          properties: {
            bold: { type: 'boolean', description: 'Bold text' },
            italic: { type: 'boolean', description: 'Italic text' },
            underline: { type: 'boolean', description: 'Underlined text' },
            align: {
              type: 'string',
              enum: ['left', 'center', 'right'],
              description: 'Text alignment',
            },
            bgColor: { type: 'string', description: 'Background color (CSS color, e.g. "#FF0000" or "red")' },
            textColor: { type: 'string', description: 'Text color (CSS color)' },
          },
          description: 'Formatting options to apply',
        },
      },
      required: ['startRow', 'startCol', 'endRow', 'endCol', 'format'],
    },
  },
  {
    name: 'set_formula',
    description: 'Set a formula in a cell. The formula should NOT start with "=" - it will be added automatically.',
    parameters: {
      type: 'object',
      properties: {
        row: {
          type: 'integer',
          description: 'Row index (0-based)',
        },
        col: {
          type: 'integer',
          description: 'Column index (0-based)',
        },
        formula: {
          type: 'string',
          description: 'The formula expression (without leading =)',
        },
      },
      required: ['row', 'col', 'formula'],
    },
  },
  {
    name: 'sort_range',
    description: 'Sort a rectangular range of cells by a specified column in ascending or descending order.',
    parameters: {
      type: 'object',
      properties: {
        startRow: {
          type: 'integer',
          description: 'Starting row index (0-based)',
        },
        startCol: {
          type: 'integer',
          description: 'Starting column index (0-based)',
        },
        endRow: {
          type: 'integer',
          description: 'Ending row index (0-based, inclusive)',
        },
        endCol: {
          type: 'integer',
          description: 'Ending column index (0-based, inclusive)',
        },
        column: {
          type: 'integer',
          description: 'Column index to sort by (0-based, relative to the sheet)',
        },
        direction: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction: ascending or descending',
        },
      },
      required: ['startRow', 'startCol', 'endRow', 'endCol', 'column', 'direction'],
    },
  },
  {
    name: 'get_sheet_data',
    description: 'Retrieve the current sheet data as a readable table. Use this to understand the current state of the spreadsheet before making changes.',
    parameters: {
      type: 'object',
      properties: {
        maxRows: {
          type: 'integer',
          description: 'Maximum number of rows to return',
          default: 50,
        },
        maxCols: {
          type: 'integer',
          description: 'Maximum number of columns to return',
          default: 26,
        },
      },
    },
  },
  {
    name: 'create_sheet',
    description: 'Create a new sheet with the given name.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the new sheet',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'rename_sheet',
    description: 'Rename the currently active sheet.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'New name for the active sheet',
        },
      },
      required: ['name'],
    },
  },
]
