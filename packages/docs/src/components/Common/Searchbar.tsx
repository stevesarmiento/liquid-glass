import styled from "styled-components";

const SearchInput = styled.input`
  width: min(260px, 100%);
  height: 34px;
  padding: 0 12px;
  color: #111111;
  background: #ffffff;
  border: 1px solid rgba(17, 17, 17, 0.12);
  border-radius: 6px;
  outline: 0;

  &::placeholder {
    color: rgba(17, 17, 17, 0.42);
  }

  &:focus {
    border-color: rgba(17, 17, 17, 0.34);
  }
`;

export default function Searchbar() {
  return <SearchInput aria-label="Search docs" placeholder="Search docs" type="search" />;
}

