// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../src/components/tabs';

describe('Tabs', () => {
  describe('Rendering', () => {
    it('should render tabs', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );
      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getAllByRole('tab')).toHaveLength(2);
    });

    it('should show default tab content', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );
      expect(screen.getByText('Content 1')).toBeVisible();
    });
  });

  describe('Interaction', () => {
    it('should switch tabs when clicked', async () => {
      const user = userEvent.setup();
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      await user.click(screen.getByRole('tab', { name: 'Tab 2' }));
      expect(screen.getByText('Content 2')).toBeVisible();
    });

    it('should support controlled value', () => {
      render(
        <Tabs value="tab2">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('data-state', 'active');
    });
  });

  describe('Disabled State', () => {
    it('should disable tab when disabled prop is true', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2" disabled>
              Tab 2
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toBeDisabled();
    });

    it('should not switch to disabled tab when clicked', async () => {
      const user = userEvent.setup();
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2" disabled>
              Tab 2
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      await user.click(screen.getByRole('tab', { name: 'Tab 2' }));
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('data-state', 'active');
    });
  });

  describe('Styling', () => {
    it('should apply custom className to TabsList', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList className="custom-list">
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content</TabsContent>
        </Tabs>
      );
      expect(screen.getByRole('tablist')).toHaveClass('custom-list');
    });

    it('should apply custom className to TabsTrigger', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1" className="custom-trigger">
              Tab 1
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content</TabsContent>
        </Tabs>
      );
      expect(screen.getByRole('tab')).toHaveClass('custom-trigger');
    });

    it('should have active styles on active tab', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content</TabsContent>
        </Tabs>
      );
      const tab = screen.getByRole('tab');
      expect(tab).toHaveClass('data-[state=active]:bg-background');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      expect(tab1).toHaveAttribute('aria-selected', 'true');

      const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
      expect(tab2).toHaveAttribute('aria-selected', 'false');
    });

    it('should have tabpanel role on content', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content</TabsContent>
        </Tabs>
      );
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });
  });
});
