import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Accordion, Accordions } from '@/components/accordion';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { File, Folder, Files } from 'fumadocs-ui/components/files';
import { GithubInfo } from 'fumadocs-ui/components/github-info';
import * as TabsComponents from 'fumadocs-ui/components/tabs';



// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...TabsComponents,
    Accordion,
    Accordions,
    TypeTable,
    File,
    Folder,
    Files,
    GithubInfo,
    ...components,
  };
}
