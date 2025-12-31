// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '../src/components/accordion';

describe('Accordion', () => {
  describe('Rendering', () => {
    it('should render accordion', () => {
      render(
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1">
            <AccordionTrigger>Section 1</AccordionTrigger>
            <AccordionContent>Content 1</AccordionContent>
          </AccordionItem>
        </Accordion>
      );
      expect(screen.getByText('Section 1')).toBeInTheDocument();
    });

    it('should render multiple items', () => {
      render(
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1">
            <AccordionTrigger>Section 1</AccordionTrigger>
            <AccordionContent>Content 1</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>Section 2</AccordionTrigger>
            <AccordionContent>Content 2</AccordionContent>
          </AccordionItem>
        </Accordion>
      );
      expect(screen.getByText('Section 1')).toBeInTheDocument();
      expect(screen.getByText('Section 2')).toBeInTheDocument();
    });

    it('should not show content by default', () => {
      render(
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1">
            <AccordionTrigger>Section 1</AccordionTrigger>
            <AccordionContent>Hidden Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );
      expect(screen.queryByText('Hidden Content')).not.toBeVisible();
    });
  });

  describe('Interaction', () => {
    it('should show content when trigger is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1">
            <AccordionTrigger>Section 1</AccordionTrigger>
            <AccordionContent>Visible Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      await user.click(screen.getByText('Section 1'));
      expect(screen.getByText('Visible Content')).toBeVisible();
    });

    it('should collapse content when trigger is clicked again', async () => {
      const user = userEvent.setup();
      render(
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1">
            <AccordionTrigger>Section 1</AccordionTrigger>
            <AccordionContent>Toggle Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      const trigger = screen.getByText('Section 1');
      await user.click(trigger);
      expect(screen.getByText('Toggle Content')).toBeVisible();

      await user.click(trigger);
      expect(screen.queryByText('Toggle Content')).not.toBeVisible();
    });
  });

  describe('Single vs Multiple', () => {
    it('should only allow one open item in single mode', async () => {
      const user = userEvent.setup();
      render(
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1">
            <AccordionTrigger>Section 1</AccordionTrigger>
            <AccordionContent>Content 1</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>Section 2</AccordionTrigger>
            <AccordionContent>Content 2</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      await user.click(screen.getByText('Section 1'));
      expect(screen.getByText('Content 1')).toBeVisible();

      await user.click(screen.getByText('Section 2'));
      expect(screen.getByText('Content 2')).toBeVisible();
      expect(screen.queryByText('Content 1')).not.toBeVisible();
    });

    it('should allow multiple open items in multiple mode', async () => {
      const user = userEvent.setup();
      render(
        <Accordion type="multiple">
          <AccordionItem value="item-1">
            <AccordionTrigger>Section 1</AccordionTrigger>
            <AccordionContent>Content 1</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>Section 2</AccordionTrigger>
            <AccordionContent>Content 2</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      await user.click(screen.getByText('Section 1'));
      await user.click(screen.getByText('Section 2'));
      expect(screen.getByText('Content 1')).toBeVisible();
      expect(screen.getByText('Content 2')).toBeVisible();
    });
  });

  describe('Default Value', () => {
    it('should open item with defaultValue', () => {
      render(
        <Accordion type="single" collapsible defaultValue="item-2">
          <AccordionItem value="item-1">
            <AccordionTrigger>Section 1</AccordionTrigger>
            <AccordionContent>Content 1</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>Section 2</AccordionTrigger>
            <AccordionContent>Content 2</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      expect(screen.queryByText('Content 1')).not.toBeVisible();
      expect(screen.getByText('Content 2')).toBeVisible();
    });
  });

  describe('Styling', () => {
    it('should apply custom className to AccordionItem', () => {
      render(
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1" className="custom-item">
            <AccordionTrigger>Section</AccordionTrigger>
            <AccordionContent>Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );
      const item = document.querySelector('.custom-item');
      expect(item).toBeInTheDocument();
    });

    it('should have border-b style on AccordionItem', () => {
      render(
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1" data-testid="item">
            <AccordionTrigger>Section</AccordionTrigger>
            <AccordionContent>Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );
      expect(screen.getByTestId('item')).toHaveClass('border-b');
    });
  });

  describe('Disabled State', () => {
    it('should not expand disabled item', async () => {
      const user = userEvent.setup();
      render(
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1" disabled>
            <AccordionTrigger>Disabled Section</AccordionTrigger>
            <AccordionContent>Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      await user.click(screen.getByText('Disabled Section'));
      expect(screen.queryByText('Content')).not.toBeVisible();
    });
  });
});
