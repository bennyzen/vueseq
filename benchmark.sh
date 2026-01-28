#!/bin/bash

# Configuration
INPUT_FILE="examples/Showcase.vue"
DURATION="24"
OUTPUT_DIR="/tmp/vueseq-bench"
LOG_FILE="benchmark_results.log"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Setup
mkdir -p "$OUTPUT_DIR"
echo "VueSeq Benchmark Run - $(date)" > "$LOG_FILE"
echo "Input: $INPUT_FILE" >> "$LOG_FILE"
echo "Duration: ${DURATION}s" >> "$LOG_FILE"
echo "----------------------------------------" >> "$LOG_FILE"

echo -e "${BLUE}Starting VueSeq Benchmark${NC}"
echo -e "Target: $INPUT_FILE (${DURATION}s)"
echo -e "Results will be logged to $LOG_FILE\n"

run_benchmark() {
    local name=$1
    local cmd=$2
    local output_file="$OUTPUT_DIR/$name.mp4"
    
    echo -e "${BLUE}Running: $name${NC}"
    echo "[$name] Started at $(date)" >> "$LOG_FILE"
    
    local start_time=$(date +%s.%N)
    
    # Run command
    echo "Executing: $cmd -o $output_file" >> "$LOG_FILE"
    eval "$cmd -o $output_file" 2>> "$LOG_FILE"
    local status=$?
    
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time $start_time" | awk '{printf "%.2f", $1 - $2}')
    
    if [ $status -eq 0 ]; then
        echo -e "${GREEN}✓ Completed in ${duration}s${NC}"
        echo "[$name] Completed: ${duration}s" >> "$LOG_FILE"
        echo "$name|$duration" >> "${OUTPUT_DIR}/stats.txt"
    else
        echo -e "${RED}✗ Failed (Exit Code: $status)${NC}"
        echo "[$name] Failed (Exit Code: $status)" >> "$LOG_FILE"
        echo "$name|FAILED" >> "${OUTPUT_DIR}/stats.txt"
    fi
    echo ""
}

# Clear previous stats
rm -f "${OUTPUT_DIR}/stats.txt"

# 1. OPTIMIZED (Baseline expectation for fast)
run_benchmark "Optimized" "npx vueseq $INPUT_FILE -d $DURATION --optimized"

# 2. PARALLEL (4 Workers)
run_benchmark "Parallel-4W" "npx vueseq $INPUT_FILE -d $DURATION --parallel --workers 4"

# 3. PARALLEL (2 Workers - test scaling)
run_benchmark "Parallel-2W" "npx vueseq $INPUT_FILE -d $DURATION --parallel --workers 2"

# 4. ORIGINAL (Standard) - Run last as it's likely slowest
# You can comment this out if it takes too long
echo -e "${BLUE}Running: Original (Standard)${NC}"
echo -e "${BLUE}(This might take a while...)${NC}"
run_benchmark "Original" "npx vueseq $INPUT_FILE -d $DURATION"

# Report
echo -e "\n${BLUE}=== FINAL RESULTS ===${NC}"
echo -e "Method\t\t\tTime"
echo "----------------------------------------"
if [ -f "${OUTPUT_DIR}/stats.txt" ]; then
    cat "${OUTPUT_DIR}/stats.txt" | column -t -s "|"
else
    echo "No results found."
fi
echo "----------------------------------------"
