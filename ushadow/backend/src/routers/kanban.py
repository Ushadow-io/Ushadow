"""API routes for kanban ticket management.

This router provides CRUD operations for tickets and epics, integrating with
the launcher's tmux and worktree systems for context-aware task management.
"""

import logging
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from beanie import PydanticObjectId
from pydantic import BaseModel

from src.models.kanban import (
    Ticket,
    Epic,
    TicketStatus,
    TicketPriority,
    TicketCreate,
    TicketRead,
    TicketUpdate,
    EpicCreate,
    EpicRead,
    EpicUpdate,
)
from src.services.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/kanban", tags=["kanban"])


# =============================================================================
# Epic Endpoints
# =============================================================================

@router.post("/epics", response_model=Dict[str, Any])
async def create_epic(
    epic_data: EpicCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new epic for grouping related tickets."""
    try:
        epic = Epic(
            title=epic_data.title,
            description=epic_data.description,
            color=epic_data.color or "#3B82F6",
            base_branch=epic_data.base_branch,
            project_id=epic_data.project_id,
            created_by=PydanticObjectId(current_user["id"])
        )
        await epic.save()

        logger.info(f"Created epic: {epic.title} (ID: {epic.id})")
        return epic.model_dump()
    except Exception as e:
        logger.error(f"Failed to create epic: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/epics", response_model=List[Dict[str, Any]])
async def list_epics(
    project_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """List all epics, optionally filtered by project."""
    try:
        query = {}
        if project_id:
            query["project_id"] = project_id

        epics = await Epic.find(query).to_list()
        return [epic.model_dump() for epic in epics]
    except Exception as e:
        logger.error(f"Failed to list epics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/epics/{epic_id}", response_model=Dict[str, Any])
async def get_epic(
    epic_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific epic by ID."""
    try:
        epic = await Epic.get(PydanticObjectId(epic_id))
        if not epic:
            raise HTTPException(status_code=404, detail="Epic not found")
        return epic.model_dump()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get epic {epic_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/epics/{epic_id}", response_model=Dict[str, Any])
async def update_epic(
    epic_id: str,
    update_data: EpicUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an epic."""
    try:
        epic = await Epic.get(PydanticObjectId(epic_id))
        if not epic:
            raise HTTPException(status_code=404, detail="Epic not found")

        # Update fields
        if update_data.title is not None:
            epic.title = update_data.title
        if update_data.description is not None:
            epic.description = update_data.description
        if update_data.color is not None:
            epic.color = update_data.color
        if update_data.branch_name is not None:
            epic.branch_name = update_data.branch_name

        await epic.save()
        logger.info(f"Updated epic: {epic.title} (ID: {epic.id})")
        return epic.model_dump()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update epic {epic_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/epics/{epic_id}")
async def delete_epic(
    epic_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an epic. Tickets in the epic will have epic_id set to None."""
    try:
        epic = await Epic.get(PydanticObjectId(epic_id))
        if not epic:
            raise HTTPException(status_code=404, detail="Epic not found")

        # Unlink tickets from epic
        tickets = await Ticket.find(Ticket.epic_id == epic.id).to_list()
        for ticket in tickets:
            ticket.epic_id = None
            ticket.epic = None
            await ticket.save()

        await epic.delete()
        logger.info(f"Deleted epic: {epic.title} (ID: {epic.id})")
        return {"status": "success", "deleted": str(epic.id)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete epic {epic_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Ticket Endpoints
# =============================================================================

@router.post("/tickets", response_model=Dict[str, Any])
async def create_ticket(
    ticket_data: TicketCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new ticket."""
    try:
        # Validate epic exists if provided
        epic_obj_id = None
        if ticket_data.epic_id:
            epic = await Epic.get(PydanticObjectId(ticket_data.epic_id))
            if not epic:
                raise HTTPException(status_code=400, detail="Epic not found")
            epic_obj_id = epic.id

        ticket = Ticket(
            title=ticket_data.title,
            description=ticket_data.description,
            status=ticket_data.status,
            priority=ticket_data.priority,
            epic_id=epic_obj_id,
            tags=ticket_data.tags,
            color=ticket_data.color,
            project_id=ticket_data.project_id,
            assigned_to=PydanticObjectId(ticket_data.assigned_to) if ticket_data.assigned_to else None,
            created_by=PydanticObjectId(current_user["id"])
        )
        await ticket.save()

        logger.info(f"Created ticket: {ticket.title} (ID: {ticket.id})")
        return ticket.model_dump()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create ticket: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tickets", response_model=List[Dict[str, Any]])
async def list_tickets(
    project_id: Optional[str] = Query(None),
    epic_id: Optional[str] = Query(None),
    status: Optional[TicketStatus] = Query(None),
    tags: Optional[str] = Query(None),  # Comma-separated tags
    assigned_to: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """List tickets with optional filters."""
    try:
        query = {}
        if project_id:
            query["project_id"] = project_id
        if epic_id:
            query["epic_id"] = PydanticObjectId(epic_id)
        if status:
            query["status"] = status
        if assigned_to:
            query["assigned_to"] = PydanticObjectId(assigned_to)

        # Tag filtering (find tickets with ANY of the specified tags)
        if tags:
            tag_list = [t.strip() for t in tags.split(",")]
            query["tags"] = {"$in": tag_list}

        tickets = await Ticket.find(query).sort("+order").to_list()
        return [ticket.model_dump() for ticket in tickets]
    except Exception as e:
        logger.error(f"Failed to list tickets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tickets/{ticket_id}", response_model=Dict[str, Any])
async def get_ticket(
    ticket_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific ticket by ID."""
    try:
        ticket = await Ticket.get(PydanticObjectId(ticket_id))
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")
        return ticket.model_dump()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get ticket {ticket_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/tickets/{ticket_id}", response_model=Dict[str, Any])
async def update_ticket(
    ticket_id: str,
    update_data: TicketUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a ticket."""
    try:
        ticket = await Ticket.get(PydanticObjectId(ticket_id))
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")

        # Update fields
        if update_data.title is not None:
            ticket.title = update_data.title
        if update_data.description is not None:
            ticket.description = update_data.description
        if update_data.status is not None:
            ticket.status = update_data.status
        if update_data.priority is not None:
            ticket.priority = update_data.priority
        if update_data.epic_id is not None:
            # Validate epic exists
            epic = await Epic.get(PydanticObjectId(update_data.epic_id))
            if not epic:
                raise HTTPException(status_code=400, detail="Epic not found")
            ticket.epic_id = epic.id
        if update_data.tags is not None:
            ticket.tags = update_data.tags
        if update_data.color is not None:
            ticket.color = update_data.color
        if update_data.assigned_to is not None:
            ticket.assigned_to = PydanticObjectId(update_data.assigned_to) if update_data.assigned_to else None
        if update_data.order is not None:
            ticket.order = update_data.order

        await ticket.save()
        logger.info(f"Updated ticket: {ticket.title} (ID: {ticket.id})")
        return ticket.model_dump()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update ticket {ticket_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/tickets/{ticket_id}")
async def delete_ticket(
    ticket_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a ticket."""
    try:
        ticket = await Ticket.get(PydanticObjectId(ticket_id))
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")

        await ticket.delete()
        logger.info(f"Deleted ticket: {ticket.title} (ID: {ticket.id})")
        return {"status": "success", "deleted": str(ticket.id)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete ticket {ticket_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Context Sharing Endpoints
# =============================================================================

@router.get("/tickets/{ticket_id}/related", response_model=List[Dict[str, Any]])
async def get_related_tickets(
    ticket_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Find tickets related to this one via epic or shared tags."""
    try:
        ticket = await Ticket.get(PydanticObjectId(ticket_id))
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")

        related = []

        # Find tickets in same epic
        if ticket.epic_id:
            epic_tickets = await Ticket.find(
                Ticket.epic_id == ticket.epic_id,
                Ticket.id != ticket.id
            ).to_list()
            related.extend(epic_tickets)

        # Find tickets with shared tags
        if ticket.tags:
            tag_tickets = await Ticket.find(
                Ticket.tags == {"$in": ticket.tags},
                Ticket.id != ticket.id
            ).to_list()
            # Deduplicate
            existing_ids = {t.id for t in related}
            for t in tag_tickets:
                if t.id not in existing_ids:
                    related.append(t)

        return [t.model_dump() for t in related]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get related tickets for {ticket_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Statistics Endpoints
# =============================================================================

@router.get("/stats", response_model=Dict[str, Any])
async def get_kanban_stats(
    project_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Get kanban board statistics."""
    try:
        query = {}
        if project_id:
            query["project_id"] = project_id

        tickets = await Ticket.find(query).to_list()

        stats = {
            "total": len(tickets),
            "by_status": {},
            "by_priority": {},
            "by_epic": {},
            "with_tmux": sum(1 for t in tickets if t.tmux_window_name),
        }

        for status in TicketStatus:
            stats["by_status"][status.value] = sum(1 for t in tickets if t.status == status)

        for priority in TicketPriority:
            stats["by_priority"][priority.value] = sum(1 for t in tickets if t.priority == priority)

        # Count tickets per epic
        epic_counts = {}
        for ticket in tickets:
            if ticket.epic_id:
                epic_id_str = str(ticket.epic_id)
                epic_counts[epic_id_str] = epic_counts.get(epic_id_str, 0) + 1
        stats["by_epic"] = epic_counts

        return stats
    except Exception as e:
        logger.error(f"Failed to get kanban stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
