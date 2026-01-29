import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Pagination } from './pagination';

const meta: Meta<typeof Pagination> = {
  title: 'Components/Pagination',
  component: Pagination,
  tags: ['autodocs'],
  argTypes: {
    currentPage: {
      control: { type: 'number', min: 1 },
      description: 'Current page (1-indexed)',
    },
    totalPages: {
      control: { type: 'number', min: 1 },
      description: 'Total number of pages',
    },
    totalItems: {
      control: 'number',
      description: 'Total item count (for summary)',
    },
    pageSize: {
      control: 'number',
      description: 'Items per page (for summary)',
    },
    showSummary: {
      control: 'boolean',
      description: 'Show "Showing X-Y of Z" summary',
    },
    showFirstLast: {
      control: 'boolean',
      description: 'Show first/last page buttons',
    },
    maxVisiblePages: {
      control: { type: 'number', min: 3, max: 10 },
      description: 'Maximum visible page buttons',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size variant',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Pagination>;

// Interactive example
export const Default: Story = {
  render: function Render() {
    const [currentPage, setCurrentPage] = useState(1);
    return (
      <Pagination
        currentPage={currentPage}
        totalPages={10}
        onPageChange={setCurrentPage}
      />
    );
  },
};

// With Summary
export const WithSummary: Story = {
  render: function Render() {
    const [currentPage, setCurrentPage] = useState(1);
    return (
      <Pagination
        currentPage={currentPage}
        totalPages={10}
        totalItems={98}
        pageSize={10}
        showSummary
        onPageChange={setCurrentPage}
      />
    );
  },
};

// With First/Last Buttons
export const WithFirstLast: Story = {
  render: function Render() {
    const [currentPage, setCurrentPage] = useState(5);
    return (
      <Pagination
        currentPage={currentPage}
        totalPages={20}
        showFirstLast
        onPageChange={setCurrentPage}
      />
    );
  },
};

// Sizes
export const Sizes: Story = {
  render: function Render() {
    const [page1, setPage1] = useState(1);
    const [page2, setPage2] = useState(1);
    const [page3, setPage3] = useState(1);

    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground mb-2">Small</p>
          <Pagination
            currentPage={page1}
            totalPages={5}
            size="sm"
            onPageChange={setPage1}
          />
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-2">Medium (default)</p>
          <Pagination
            currentPage={page2}
            totalPages={5}
            size="md"
            onPageChange={setPage2}
          />
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-2">Large</p>
          <Pagination
            currentPage={page3}
            totalPages={5}
            size="lg"
            onPageChange={setPage3}
          />
        </div>
      </div>
    );
  },
};

// Few Pages (No Ellipsis)
export const FewPages: Story = {
  render: function Render() {
    const [currentPage, setCurrentPage] = useState(2);
    return (
      <Pagination
        currentPage={currentPage}
        totalPages={5}
        onPageChange={setCurrentPage}
      />
    );
  },
};

// Many Pages (With Ellipsis)
export const ManyPages: Story = {
  render: function Render() {
    const [currentPage, setCurrentPage] = useState(10);
    return (
      <Pagination
        currentPage={currentPage}
        totalPages={50}
        showFirstLast
        onPageChange={setCurrentPage}
      />
    );
  },
};

// Single Page
export const SinglePage: Story = {
  render: () => (
    <Pagination
      currentPage={1}
      totalPages={1}
      onPageChange={() => {}}
    />
  ),
};

// On First Page
export const OnFirstPage: Story = {
  render: function Render() {
    const [currentPage, setCurrentPage] = useState(1);
    return (
      <Pagination
        currentPage={currentPage}
        totalPages={10}
        showFirstLast
        onPageChange={setCurrentPage}
      />
    );
  },
};

// On Last Page
export const OnLastPage: Story = {
  render: function Render() {
    const [currentPage, setCurrentPage] = useState(10);
    return (
      <Pagination
        currentPage={currentPage}
        totalPages={10}
        showFirstLast
        onPageChange={setCurrentPage}
      />
    );
  },
};

// Full Example (In Table Context)
export const InTableContext: Story = {
  render: function Render() {
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 5;
    const totalItems = 47;
    const totalPages = Math.ceil(totalItems / pageSize);

    const data = Array.from({ length: totalItems }, (_, i) => ({
      id: i + 1,
      name: `Item ${i + 1}`,
      status: ['Active', 'Pending', 'Completed'][i % 3],
    }));

    const startIndex = (currentPage - 1) * pageSize;
    const pageData = data.slice(startIndex, startIndex + pageSize);

    return (
      <div className="w-full max-w-2xl space-y-4">
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-muted-foreground">
                  ID
                </th>
                <th className="px-4 py-2 text-left text-sm font-medium text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-2 text-left text-sm font-medium text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageData.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm text-foreground">{item.id}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{item.name}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          showSummary
          onPageChange={setCurrentPage}
        />
      </div>
    );
  },
};

// Custom Max Visible Pages
export const CustomMaxVisible: Story = {
  render: function Render() {
    const [currentPage, setCurrentPage] = useState(10);
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground mb-2">3 visible pages</p>
          <Pagination
            currentPage={currentPage}
            totalPages={20}
            maxVisiblePages={3}
            onPageChange={setCurrentPage}
          />
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-2">5 visible pages (default)</p>
          <Pagination
            currentPage={currentPage}
            totalPages={20}
            maxVisiblePages={5}
            onPageChange={setCurrentPage}
          />
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-2">7 visible pages</p>
          <Pagination
            currentPage={currentPage}
            totalPages={20}
            maxVisiblePages={7}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>
    );
  },
};
