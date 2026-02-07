"""
Event Indexer Service

Long-running background service that:
1. Polls new blocks from RPC
2. Decodes events from WorkProof, LoanVault contracts
3. Stores events in PostgreSQL
4. Tracks last processed block
"""

import time
import sys
from web3 import Web3
from sqlalchemy.orm import Session

from settings import get_settings, validate_settings_on_startup
from database import (
    get_session_local,
    init_db,
    WorkProofEvent,
    LoanEvent,
    RepayEvent,
    IndexerState,
)


# Event ABIs
WORKPROOF_SUBMITTED_ABI = {
    "name": "WorkProofSubmitted",
    "type": "event",
    "inputs": [
        {"name": "proofId", "type": "uint256", "indexed": True},
        {"name": "worker", "type": "address", "indexed": True},
        {"name": "proofHash", "type": "bytes32", "indexed": False},
        {"name": "workUnits", "type": "uint256", "indexed": False},
        {"name": "earnedAmount", "type": "uint256", "indexed": False},
        {"name": "timestamp", "type": "uint256", "indexed": False},
    ],
}

LOAN_APPROVED_ABI = {
    "name": "LoanApproved",
    "type": "event",
    "inputs": [
        {"name": "borrower", "type": "address", "indexed": True},
        {"name": "principal", "type": "uint256", "indexed": False},
        {"name": "interestAmount", "type": "uint256", "indexed": False},
        {"name": "dueDate", "type": "uint64", "indexed": False},
        {"name": "nonce", "type": "uint64", "indexed": False},
    ],
}

REPAID_ABI = {
    "name": "Repaid",
    "type": "event",
    "inputs": [
        {"name": "borrower", "type": "address", "indexed": True},
        {"name": "amount", "type": "uint256", "indexed": False},
        {"name": "remaining", "type": "uint256", "indexed": False},
    ],
}


class EventIndexer:
    """Long-running event indexer service."""

    def __init__(self):
        self.settings = get_settings()
        self.w3 = Web3(Web3.HTTPProvider(self.settings.RPC_URL))
        self.SessionLocal = get_session_local()

        # Create contract interfaces
        self.workproof_contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.settings.WORKPROOF_ADDRESS),
            abi=[WORKPROOF_SUBMITTED_ABI],
        )
        self.loanvault_contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.settings.LOAN_VAULT_ADDRESS),
            abi=[LOAN_APPROVED_ABI, REPAID_ABI],
        )

        # Event signatures
        self.workproof_topic = self.w3.keccak(
            text="WorkProofSubmitted(uint256,address,bytes32,uint256,uint256,uint256)"
        ).hex()
        self.loan_approved_topic = self.w3.keccak(
            text="LoanApproved(address,uint256,uint256,uint64,uint64)"
        ).hex()
        self.repaid_topic = self.w3.keccak(
            text="Repaid(address,uint256,uint256)"
        ).hex()

    def get_last_processed_block(self, db: Session) -> int:
        """Get last processed block from DB."""
        state = db.query(IndexerState).filter(
            IndexerState.chain_id == self.settings.CHAIN_ID
        ).first()
        
        if state:
            return state.last_processed_block
        
        # Initialize state
        start_block = max(0, self.settings.INDEXER_START_BLOCK)
        state = IndexerState(
            chain_id=self.settings.CHAIN_ID,
            last_processed_block=start_block,
        )
        db.add(state)
        db.commit()
        return start_block

    def update_last_processed_block(self, db: Session, block_number: int):
        """Update last processed block in DB."""
        state = db.query(IndexerState).filter(
            IndexerState.chain_id == self.settings.CHAIN_ID
        ).first()
        
        if state:
            state.last_processed_block = block_number
            db.commit()

    def process_workproof_event(self, db: Session, log: dict):
        """Process a WorkProofSubmitted event."""
        try:
            decoded = self.workproof_contract.events.WorkProofSubmitted().process_log(log)
            args = decoded["args"]

            # Check if already exists
            exists = db.query(WorkProofEvent).filter(
                WorkProofEvent.tx_hash == log["transactionHash"].hex()
            ).first()
            if exists:
                return

            event = WorkProofEvent(
                proof_id=args["proofId"],
                worker=args["worker"].lower(),
                proof_hash=args["proofHash"].hex(),
                work_units=args["workUnits"],
                earned_amount=str(args["earnedAmount"]),
                event_timestamp=args["timestamp"],
                block_number=log["blockNumber"],
                tx_hash=log["transactionHash"].hex(),
                log_index=log["logIndex"],
            )
            db.add(event)
            print(f"  ✅ WorkProofSubmitted: worker={args['worker'][:10]}...")
        except Exception as e:
            print(f"  ❌ Failed to process WorkProofSubmitted: {e}")

    def process_loan_approved_event(self, db: Session, log: dict):
        """Process a LoanApproved event."""
        try:
            decoded = self.loanvault_contract.events.LoanApproved().process_log(log)
            args = decoded["args"]

            exists = db.query(LoanEvent).filter(
                LoanEvent.tx_hash == log["transactionHash"].hex()
            ).first()
            if exists:
                return

            event = LoanEvent(
                borrower=args["borrower"].lower(),
                principal=str(args["principal"]),
                interest_amount=str(args["interestAmount"]),
                due_date=args["dueDate"],
                nonce=args["nonce"],
                block_number=log["blockNumber"],
                tx_hash=log["transactionHash"].hex(),
                log_index=log["logIndex"],
            )
            db.add(event)
            print(f"  ✅ LoanApproved: borrower={args['borrower'][:10]}...")
        except Exception as e:
            print(f"  ❌ Failed to process LoanApproved: {e}")

    def process_repaid_event(self, db: Session, log: dict):
        """Process a Repaid event."""
        try:
            decoded = self.loanvault_contract.events.Repaid().process_log(log)
            args = decoded["args"]

            exists = db.query(RepayEvent).filter(
                RepayEvent.tx_hash == log["transactionHash"].hex()
            ).first()
            if exists:
                return

            event = RepayEvent(
                borrower=args["borrower"].lower(),
                amount=str(args["amount"]),
                remaining=str(args["remaining"]),
                block_number=log["blockNumber"],
                tx_hash=log["transactionHash"].hex(),
                log_index=log["logIndex"],
            )
            db.add(event)
            print(f"  ✅ Repaid: borrower={args['borrower'][:10]}...")
        except Exception as e:
            print(f"  ❌ Failed to process Repaid: {e}")

    def process_block_range(self, db: Session, from_block: int, to_block: int):
        """Process events in a block range."""
        if from_block > to_block:
            return

        # Get logs from WorkProof contract
        try:
            workproof_logs = self.w3.eth.get_logs({
                "address": Web3.to_checksum_address(self.settings.WORKPROOF_ADDRESS),
                "fromBlock": from_block,
                "toBlock": to_block,
                "topics": [self.workproof_topic],
            })
            for log in workproof_logs:
                self.process_workproof_event(db, log)
        except Exception as e:
            print(f"  ⚠️ Failed to get WorkProof logs: {e}")

        # Get logs from LoanVault contract
        try:
            loan_logs = self.w3.eth.get_logs({
                "address": Web3.to_checksum_address(self.settings.LOAN_VAULT_ADDRESS),
                "fromBlock": from_block,
                "toBlock": to_block,
            })
            for log in loan_logs:
                topic0 = log["topics"][0].hex() if log["topics"] else None
                if topic0 == self.loan_approved_topic:
                    self.process_loan_approved_event(db, log)
                elif topic0 == self.repaid_topic:
                    self.process_repaid_event(db, log)
        except Exception as e:
            print(f"  ⚠️ Failed to get LoanVault logs: {e}")

        db.commit()

    def run(self):
        """Main indexer loop."""
        # Get initial state for logging
        try:
            latest_block = self.w3.eth.block_number
        except Exception:
            latest_block = "unknown"
        
        db = self.SessionLocal()
        try:
            start_block = self.get_last_processed_block(db)
        finally:
            db.close()
        
        print("\n" + "=" * 60)
        print("🔍 UnEmpower Event Indexer Starting...")
        print("=" * 60)
        print(f"  Chain ID:        {self.settings.CHAIN_ID}")
        print(f"  RPC URL:         {self.settings.RPC_URL[:50]}...")
        print(f"  Start Block:     {start_block}")
        print(f"  Latest Block:    {latest_block}")
        print(f"  Poll Interval:   {self.settings.INDEXER_POLL_INTERVAL}s")
        print("=" * 60)
        print("  Contracts Being Indexed:")
        print(f"    WorkProof:  {self.settings.WORKPROOF_ADDRESS}")
        print(f"    LoanVault:  {self.settings.LOAN_VAULT_ADDRESS}")
        print("=" * 60 + "\n")

        while True:
            try:
                db = self.SessionLocal()
                try:
                    current_block = self.w3.eth.block_number
                    last_processed = self.get_last_processed_block(db)
                    
                    if last_processed < current_block:
                        # Process in chunks of 100 blocks
                        chunk_size = 100
                        from_block = last_processed + 1
                        to_block = min(from_block + chunk_size - 1, current_block)
                        
                        print(f"📦 Processing blocks {from_block} - {to_block} (current: {current_block})")
                        self.process_block_range(db, from_block, to_block)
                        self.update_last_processed_block(db, to_block)
                    else:
                        print(f"⏳ Up to date at block {current_block}, waiting...")
                finally:
                    db.close()

            except KeyboardInterrupt:
                print("\n🛑 Indexer stopped by user")
                break
            except Exception as e:
                print(f"❌ Indexer error: {e}")

            time.sleep(self.settings.INDEXER_POLL_INTERVAL)


def main():
    """Entry point for indexer."""
    # Validate settings
    validate_settings_on_startup()
    
    # Initialize database
    init_db()
    
    # Run indexer
    indexer = EventIndexer()
    indexer.run()


if __name__ == "__main__":
    main()
