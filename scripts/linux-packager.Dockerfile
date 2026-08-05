FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d

RUN apt-get update \
  && apt-get install --yes --no-install-recommends binutils ca-certificates rpm xz-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /project
