<script lang="ts">
  import { testnet } from "$lib/utils/stores";
  import {Avail, getChainName } from "../utils/networkData";
  import Chevron from "./icons/Chevron.svelte";

  export let network: number = -1;
  let disabled: boolean = false;
  let input: HTMLInputElement;

  let customValue: boolean = false;
  $: customValue = !getChainName(Avail, network);


  function selectChain(chain: number) {
    // calling blur closes the dropdown
    const elem = document.activeElement as HTMLElement;
    if (elem) {
      elem?.blur();
    }
    network = chain;
  }
</script>

<div class="inputs-container">
  <label class="label" for="address">
    <span class="form-label">Chain</span>
  </label>
  {#if !customValue}
    <div class="dropdown dropdown-top md:dropdown-bottom w-full">
      <div tabindex="0" class="chain-dropdown" data-testid="dropdown">
        <div class="w-full flex justify-between">
          <div>
            {getChainName($testnet, network)}
          </div>
          <Chevron />
        </div>
      </div>
      <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-full text-white">
        {#each $testnet.chains as chain, i}
          <li class:selected={network === chain.id} data-testid={`network-${i}`}>
            <a on:click={() => selectChain(chain.id)}>{chain.name}</a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style lang="postcss">
  .inputs-container {
    margin-bottom: 1.5rem;
  }

  .inter {
    font-family: "Inter", sans-serif;
  }

  .form-background {
    background-color: #191924;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .form-label {
    @apply label-text text-white;
    font-weight: 500;
    font-size: 16px;
  }

  .selected {
    @apply bg-primary;
  }

  .custom-chain-switch {
    @apply text-left hover:underline hover:cursor-pointer;
    color: #c4affa;
    font-family: "Inter", sans-serif;
    font-weight: 400;
    font-size: 14px;
    margin-top: 8px;
  }

  .chain-dropdown {
    @apply input w-full text-sm form-background text-white inter flex flex-col justify-center items-center cursor-pointer;
  }

  /* Chrome, Safari, Edge, Opera */
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  /* Firefox */
  input[type="number"] {
    -moz-appearance: textfield;
  }
</style>
