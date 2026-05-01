import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "@inkjs/ui";

interface ToolRowProps {
  tool: string;
  status: "running" | "done" | "error";
  summary?: string;
}

export function ToolRow({ tool, status, summary }: ToolRowProps) {
  if (status === "running") {
    return (
      <Box>
        <Text>{"● "}{tool}{"  "}</Text>
        <Spinner />
      </Box>
    );
  }

  if (status === "done") {
    return (
      <Box>
        <Text>{"● "}{tool}{"  "}</Text>
        <Text color="green">{"✓"}</Text>
        {summary ? <Text dimColor>{"  "}{summary}</Text> : null}
      </Box>
    );
  }

  return (
    <Box>
      <Text>{"● "}{tool}{"  "}</Text>
      <Text color="red">{"✗"}</Text>
      {summary ? <Text color="red">{"  "}{summary}</Text> : null}
    </Box>
  );
}
