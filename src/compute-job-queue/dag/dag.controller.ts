import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from "@nestjs/swagger";
import { DagService } from "./dag.service";
import {
  CreateDagWorkflowDto,
  DagWorkflowResponseDto,
  DagValidationResponseDto,
  DagNodeResponseDto,
} from "./dag.dto";
import { DagWorkflow } from "./dag.interfaces";

@ApiTags("dag")
@Controller("queue/dag")
export class DagController {
  constructor(private readonly dagService: DagService) {}

  @Post("workflows")
  @ApiOperation({ summary: "Submit a new DAG workflow" })
  @ApiResponse({
    status: 201,
    description: "Workflow created and root jobs enqueued",
    type: DagWorkflowResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid DAG structure" })
  async submitWorkflow(
    @Body() dto: CreateDagWorkflowDto,
  ): Promise<DagWorkflowResponseDto> {
    const workflow = await this.dagService.submitWorkflow(dto);
    return this.toWorkflowResponse(workflow);
  }

  @Post("workflows/validate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Validate a DAG structure without submitting" })
  @ApiResponse({
    status: 200,
    description: "Validation result",
    type: DagValidationResponseDto,
  })
  validateWorkflow(
    @Body() dto: CreateDagWorkflowDto,
  ): DagValidationResponseDto {
    const result = this.dagService.validateWorkflow(dto);
    return {
      valid: result.valid,
      errors: result.errors,
      topologicalOrder: result.topologicalOrder,
    };
  }

  @Get("workflows")
  @ApiOperation({ summary: "List all DAG workflows" })
  @ApiResponse({ status: 200, description: "Workflow list returned" })
  listWorkflows() {
    return this.dagService.listWorkflows().map((wf) => ({
      workflowId: wf.workflowId,
      name: wf.name,
      status: wf.status,
      nodeCount: wf.nodeCount,
      createdAt: wf.createdAt.toISOString(),
    }));
  }

  @Get("workflows/:id")
  @ApiOperation({ summary: "Get a DAG workflow by ID" })
  @ApiParam({ name: "id", description: "Workflow ID" })
  @ApiResponse({
    status: 200,
    description: "Workflow details returned",
    type: DagWorkflowResponseDto,
  })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  getWorkflow(@Param("id") id: string): DagWorkflowResponseDto {
    const workflow = this.dagService.getWorkflow(id);
    return this.toWorkflowResponse(workflow);
  }

  @Post("workflows/:id/cancel")
  @ApiOperation({ summary: "Cancel a running DAG workflow" })
  @ApiParam({ name: "id", description: "Workflow ID" })
  @ApiResponse({ status: 200, description: "Workflow cancelled" })
  @ApiResponse({ status: 400, description: "Workflow already completed" })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async cancelWorkflow(
    @Param("id") id: string,
  ): Promise<DagWorkflowResponseDto> {
    const workflow = await this.dagService.cancelWorkflow(id);
    return this.toWorkflowResponse(workflow);
  }

  // ---------------------------------------------------------------------------
  // Response mapping
  // ---------------------------------------------------------------------------

  private toWorkflowResponse(workflow: DagWorkflow): DagWorkflowResponseDto {
    const nodes: DagNodeResponseDto[] = Array.from(workflow.nodes.values()).map(
      (node) => ({
        jobId: node.jobId,
        type: node.type,
        status: node.status,
        queueJobId: node.queueJobId,
        result: node.result,
        error: node.error,
        dependsOn: node.dependsOn.map((d) => ({
          jobId: d.jobId,
          condition: d.condition,
        })),
      }),
    );

    return {
      workflowId: workflow.workflowId,
      name: workflow.name,
      status: workflow.status,
      nodes,
      topologicalOrder: workflow.topologicalOrder,
      createdAt: workflow.createdAt.toISOString(),
      completedAt: workflow.completedAt?.toISOString(),
    };
  }
}
